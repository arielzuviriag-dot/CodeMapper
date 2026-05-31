package com.codemapper.service;

import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.domain.ParsedClass;
import com.codemapper.model.domain.ParsedField;
import com.codemapper.model.domain.ParsedMethod;
import com.codemapper.model.domain.SessionData;
import com.codemapper.model.dto.ExceptionCauseDto;
import com.codemapper.model.dto.ExceptionFrameDto;
import com.codemapper.model.dto.ExceptionReportDto;
import com.codemapper.model.dto.MobileOriginDto;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.ErrorEvent;
import com.codemapper.model.event.ExceptionReportEvent;
import com.codemapper.model.event.FocusClassLoadedEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import com.codemapper.model.event.MobileOriginsEvent;
import com.codemapper.model.event.SessionCompleteEvent;
import com.codemapper.model.event.SessionStartEvent;
import com.codemapper.parser.ClassExtractor;
import com.codemapper.parser.ExceptionTraceParser;
import com.codemapper.parser.FieldExtractor;
import com.codemapper.parser.MethodExtractor;
import com.codemapper.parser.MobileEndpointScanner;
import com.codemapper.parser.SymbolSolverConfigurer;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.ArrayInitializerExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * "Ariadna" — exception-investigation tracer. Given a pasted Java stack trace
 * and the project it came from, it:
 *
 * <ol>
 *   <li>parses the trace into its causal chain ({@link ExceptionTraceParser});</li>
 *   <li>resolves which frames are the user's own code (present in the project);</li>
 *   <li>picks the FOCUS = throw site of the root cause (deepest user-code
 *       frame);</li>
 *   <li>streams the focus class + every other user-code class in the chain as
 *       peripherals (reusing the FOCO event shapes so the radial map renders
 *       for free), plus one {@link ExceptionReportEvent} with the structured
 *       Informe.</li>
 * </ol>
 *
 * <p>100% deterministic — the chain, the line numbers and the "where it blew
 * up" all come from the trace text. No AI.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExceptionTracerService {

    private final ExceptionTraceParser traceParser;
    private final ClassExtractor classExtractor;
    private final FieldExtractor fieldExtractor;
    private final MethodExtractor methodExtractor;
    private final JavaVersionDetector javaVersionDetector;
    private final SymbolSolverConfigurer symbolSolverConfigurer;
    private final MobileEndpointScanner mobileScanner;

    /** A controller method's HTTP mapping — verb + normalized path. */
    private record Endpoint(String verb, String path) {}

    public void trace(SessionData session, Consumer<BaseEvent> sink) throws IOException {
        Instant start = Instant.now();
        session.setStatus(SessionData.Status.PARSING);
        Path projectRoot = session.getProjectPath();

        String javaVersion = javaVersionDetector.detect(projectRoot);
        session.setDetectedJavaVersion(javaVersion);
        // Configure StaticJavaParser's language level (and source roots) so
        // files using Java 17 syntax parse cleanly — without this, modern
        // classes silently fail to parse and look like "library" frames.
        symbolSolverConfigurer.configure(projectRoot, javaVersion);
        sink.accept(new SessionStartEvent(
                session.getTotalFiles(), session.getProjectName(), start, javaVersion));

        List<ExceptionCauseDto> causes = traceParser.parse(session.getStackTrace());
        if (causes.isEmpty()) {
            sink.accept(new ErrorEvent(
                    "No se pudo interpretar el stack trace pegado.", null, null));
            session.setStatus(SessionData.Status.COMPLETED);
            return;
        }

        // Distinct top-level FQNs referenced anywhere in the trace.
        Set<String> neededFqns = new HashSet<>();
        for (ExceptionCauseDto cause : causes) {
            for (ExceptionFrameDto f : cause.getFrames()) {
                if (f.getTopLevelFqn() != null && !f.getTopLevelFqn().isEmpty()) {
                    neededFqns.add(f.getTopLevelFqn());
                }
            }
        }

        // Resolve those FQNs against the project's source files. Also capture
        // each resolved class's controller mappings (methodName → endpoint) so
        // we can link mobile screens to the controllers in the chain.
        Map<String, Map<String, Endpoint>> mappingsByFqn = new HashMap<>();
        Map<String, ParsedClass> byFqn = resolveProjectClasses(projectRoot, neededFqns, mappingsByFqn);

        // Tag every frame: userCode + classId when we found its class.
        for (ExceptionCauseDto cause : causes) {
            for (ExceptionFrameDto f : cause.getFrames()) {
                ParsedClass pc = byFqn.get(f.getTopLevelFqn());
                if (pc != null) {
                    f.setUserCode(true);
                    f.setClassId(pc.getId());
                }
            }
        }

        // FOCUS = throw site of the ROOT cause: scan causes deepest→shallowest,
        // take the first user-code frame found.
        ExceptionFrameDto focusFrame = null;
        for (int i = causes.size() - 1; i >= 0 && focusFrame == null; i--) {
            for (ExceptionFrameDto f : causes.get(i).getFrames()) {
                if (f.isUserCode()) {
                    focusFrame = f;
                    break;
                }
            }
        }

        if (focusFrame == null) {
            // Trace had no class belonging to this project — can't anchor a map.
            // No hard error event (that would close the stream): just ship the
            // report so the Informe panel still shows the exception type/message
            // (útil cuando es un error de config/librería, ej. Firebase/Gradle),
            // y completamos limpio.
            sink.accept(new ExceptionReportEvent(buildReport(causes, null)));
            long ms = Duration.between(start, Instant.now()).toMillis();
            sink.accept(new SessionCompleteEvent(0, 0, ms));
            session.setStatus(SessionData.Status.COMPLETED);
            log.info("Exception trace for session {}: {} causes, sin código del proyecto",
                    session.getSessionId(), causes.size());
            return;
        }

        ParsedClass focusClass = byFqn.get(focusFrame.getTopLevelFqn());

        // Persist parsed classes on the session so the source-fetch endpoint
        // (ClassDetailSheet) can read their file paths by id.
        session.getParsedClasses().addAll(byFqn.values());

        // Emit the focus class (center of the radial map).
        sink.accept(new FocusClassLoadedEvent(
                focusClass.getId(),
                focusClass.getFullyQualifiedName(),
                focusClass.getName(),
                focusClass.getPackageName(),
                focusClass.getType(),
                focusClass.getAnnotations(),
                focusClass.getModifiers(),
                focusClass.getFields(),
                focusClass.getMethods(),
                Collections.emptyList(),
                null,
                focusClass.getFilePath(),
                focusClass.getLineCount(),
                Collections.emptyList(),
                null,
                Collections.emptyMap()));

        // Every OTHER user-code class in the chain becomes a peripheral. Since
        // the focus is the DEEPEST throw site, all other user-code frames are
        // callers along the path → CALLED_BY. Distinct by class, first method
        // wins as the via-method label.
        Set<String> emitted = new HashSet<>();
        emitted.add(focusClass.getId());
        int position = 1;
        for (ExceptionCauseDto cause : causes) {
            for (ExceptionFrameDto f : cause.getFrames()) {
                if (!f.isUserCode()) continue;
                ParsedClass pc = byFqn.get(f.getTopLevelFqn());
                if (pc == null || emitted.contains(pc.getId())) continue;
                emitted.add(pc.getId());
                sink.accept(new FocusConnectionEvent(
                        pc.getId(),
                        pc.getFullyQualifiedName(),
                        pc.getName(),
                        pc.getPackageName(),
                        pc.getType(),
                        pc.getAnnotations(),
                        FocusConnectionType.CALLED_BY,
                        pc.getFields(),
                        pc.getMethods(),
                        position++,
                        pc.getFilePath(),
                        f.getMethodName(),   // viaMethodInSource — caller's method
                        null,                // viaMethodInTarget
                        null,                // controlContext
                        false,               // isTest
                        false,               // isMock
                        null,                // referenceKind
                        0));                 // callOrder (no aplica)
            }
        }

        // The structured Informe (chain + messages + where it blew up).
        sink.accept(new ExceptionReportEvent(buildReport(causes, focusFrame)));

        // Mobile (React Native) origins: link screens → endpoints in the chain.
        if (session.getMobilePath() != null && !session.getMobilePath().isBlank()) {
            try {
                List<MobileOriginDto> origins = matchMobileOrigins(
                        session.getMobilePath(), causes, byFqn, mappingsByFqn);
                if (!origins.isEmpty()) {
                    sink.accept(new MobileOriginsEvent(origins));
                    log.info("Mobile origins for session {}: {}", session.getSessionId(), origins.size());
                }
            } catch (Exception e) {
                log.warn("Mobile origin matching failed for session {}: {}",
                        session.getSessionId(), e.getMessage());
            }
        }

        long durationMs = Duration.between(start, Instant.now()).toMillis();
        sink.accept(new SessionCompleteEvent(
                session.getParsedClasses().size(), position - 1, durationMs));
        session.setStatus(SessionData.Status.COMPLETED);

        log.info("Exception trace for session {}: {} causes, focus={}, {} peripherals, {} ms",
                session.getSessionId(), causes.size(),
                focusFrame.getTopLevelFqn(), position - 1, durationMs);
    }

    private ExceptionReportDto buildReport(List<ExceptionCauseDto> causes, ExceptionFrameDto focusFrame) {
        ExceptionCauseDto top = causes.get(0);
        ExceptionCauseDto root = causes.get(causes.size() - 1);
        ExceptionReportDto report = new ExceptionReportDto();
        report.setCauses(causes);
        report.setTopExceptionType(top.getExceptionType());
        report.setTopExceptionMessage(top.getMessage());
        report.setRootCauseType(root.getExceptionType());
        report.setRootCauseMessage(root.getMessage());
        if (focusFrame != null) {
            report.setFocusFqn(focusFrame.getTopLevelFqn());
            report.setFocusClassId(focusFrame.getClassId());
            report.setFocusMethod(focusFrame.getMethodName());
            report.setFocusLine(focusFrame.getLineNumber());
        }
        return report;
    }

    /**
     * Walk the project once; for every top-level type whose FQN is in
     * {@code neededFqns}, fully extract it (class meta + fields + methods).
     * Returns FQN → ParsedClass for the matched subset only.
     */
    private Map<String, ParsedClass> resolveProjectClasses(
            Path projectRoot, Set<String> neededFqns,
            Map<String, Map<String, Endpoint>> mappingsOut) throws IOException {
        Map<String, ParsedClass> byFqn = new LinkedHashMap<>();
        if (projectRoot == null || neededFqns.isEmpty()) {
            return byFqn;
        }
        Set<String> remaining = new LinkedHashSet<>(neededFqns);

        List<Path> files = collectJavaFiles(projectRoot);
        for (Path file : files) {
            if (remaining.isEmpty()) break;
            CompilationUnit cu;
            try {
                cu = StaticJavaParser.parse(file.toFile());
            } catch (Exception e) {
                continue; // unparseable file — skip, stays "library/unknown"
            }
            String pkg = cu.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("");
            for (TypeDeclaration<?> type : cu.getTypes()) {
                String fqn = pkg.isEmpty()
                        ? type.getNameAsString()
                        : pkg + "." + type.getNameAsString();
                if (!remaining.remove(fqn)) {
                    continue;
                }
                try {
                    ParsedClass pc = classExtractor.extract(type, pkg, file.toString());
                    List<ParsedField> fields = fieldExtractor.extract(type);
                    List<ParsedMethod> methods = methodExtractor.extract(type);
                    pc.setFields(fields);
                    pc.setMethods(methods);
                    byFqn.put(fqn, pc);

                    Map<String, Endpoint> mappings = extractMappings(type);
                    if (!mappings.isEmpty()) {
                        mappingsOut.put(fqn, mappings);
                    }
                } catch (Exception e) {
                    log.warn("Could not extract {} from {}: {}", fqn, file, e.getMessage());
                }
            }
        }
        return byFqn;
    }

    // ── Spring mapping extraction ───────────────────────────────────────

    /** Extract methodName → endpoint (verb + normalized path) for every mapped
     *  method of a controller. Empty when the class has no Spring mappings. */
    private Map<String, Endpoint> extractMappings(TypeDeclaration<?> type) {
        Map<String, Endpoint> out = new LinkedHashMap<>();
        String prefix = "";
        for (AnnotationExpr ann : type.getAnnotations()) {
            if ("RequestMapping".equals(ann.getNameAsString())) {
                prefix = annPath(ann);
                break;
            }
        }
        for (MethodDeclaration md : type.getMethods()) {
            Endpoint ep = endpointFor(md, prefix);
            if (ep != null && ep.path() != null) {
                out.put(md.getNameAsString(), ep);
            }
        }
        return out;
    }

    private Endpoint endpointFor(MethodDeclaration md, String classPrefix) {
        for (AnnotationExpr ann : md.getAnnotations()) {
            String n = ann.getNameAsString();
            String verb = switch (n) {
                case "GetMapping" -> "GET";
                case "PostMapping" -> "POST";
                case "PutMapping" -> "PUT";
                case "PatchMapping" -> "PATCH";
                case "DeleteMapping" -> "DELETE";
                case "RequestMapping" -> requestMappingVerb(ann); // "" = any
                default -> null;
            };
            if (verb == null) continue;
            String full = joinPaths(classPrefix, annPath(ann));
            return new Endpoint(verb, MobileEndpointScanner.normalizePath(full));
        }
        return null;
    }

    /** Read the path string from a mapping annotation (value/path member, or the
     *  single member). Returns "" when none / not a literal. */
    private String annPath(AnnotationExpr ann) {
        if (ann instanceof SingleMemberAnnotationExpr sma) {
            return literalOf(sma.getMemberValue());
        }
        if (ann instanceof NormalAnnotationExpr na) {
            for (var pair : na.getPairs()) {
                String name = pair.getNameAsString();
                if ("value".equals(name) || "path".equals(name)) {
                    return literalOf(pair.getValue());
                }
            }
        }
        return "";
    }

    private String requestMappingVerb(AnnotationExpr ann) {
        if (ann instanceof NormalAnnotationExpr na) {
            for (var pair : na.getPairs()) {
                if ("method".equals(pair.getNameAsString())) {
                    String v = pair.getValue().toString(); // e.g. RequestMethod.POST
                    int dot = v.lastIndexOf('.');
                    return (dot >= 0 ? v.substring(dot + 1) : v).replaceAll("[^A-Za-z]", "");
                }
            }
        }
        return ""; // no method specified → matches any verb
    }

    /** First string literal of an expression (handles {@code "/x"} and
     *  {@code {"/x","/y"}} array forms). "" when not a literal. */
    private String literalOf(Expression expr) {
        if (expr instanceof StringLiteralExpr s) {
            return s.getValue();
        }
        if (expr instanceof ArrayInitializerExpr arr) {
            for (Expression e : arr.getValues()) {
                if (e instanceof StringLiteralExpr s) return s.getValue();
            }
        }
        return "";
    }

    private String joinPaths(String prefix, String path) {
        String a = trimSlashes(prefix);
        String b = trimSlashes(path);
        StringBuilder sb = new StringBuilder("/");
        if (!a.isEmpty()) sb.append(a);
        if (!b.isEmpty()) {
            if (sb.charAt(sb.length() - 1) != '/') sb.append('/');
            sb.append(b);
        }
        return sb.toString();
    }

    private String trimSlashes(String s) {
        if (s == null) return "";
        String t = s.trim();
        while (t.startsWith("/")) t = t.substring(1);
        while (t.endsWith("/")) t = t.substring(0, t.length() - 1);
        return t;
    }

    // ── Mobile screen ↔ endpoint matching ───────────────────────────────

    private static final int MAX_MOBILE_ORIGINS = 12;

    private List<MobileOriginDto> matchMobileOrigins(
            String mobilePath,
            List<ExceptionCauseDto> causes,
            Map<String, ParsedClass> byFqn,
            Map<String, Map<String, Endpoint>> mappingsByFqn) {

        List<MobileOriginDto> origins = new ArrayList<>();
        Path root = Path.of(mobilePath);
        if (!Files.isDirectory(root)) {
            log.warn("Mobile path is not a directory: {}", mobilePath);
            return origins;
        }
        MobileEndpointScanner.ScanResult scan = mobileScanner.scan(root);
        if (scan.apiCalls().isEmpty()) return origins;

        Set<String> seen = new HashSet<>();
        for (ExceptionCauseDto cause : causes) {
            for (ExceptionFrameDto frame : cause.getFrames()) {
                if (!frame.isUserCode()) continue;
                Map<String, Endpoint> byMethod = mappingsByFqn.get(frame.getTopLevelFqn());
                if (byMethod == null) continue;
                Endpoint ep = byMethod.get(frame.getMethodName());
                if (ep == null || ep.path() == null) continue;
                ParsedClass controller = byFqn.get(frame.getTopLevelFqn());
                if (controller == null) continue;

                for (MobileEndpointScanner.RnApiCall call : scan.apiCalls()) {
                    if (!verbMatches(ep.verb(), call.verb())) continue;
                    if (!pathsMatch(ep.path(), call.path())) continue;
                    List<String> screens = scan.screensByFunction()
                            .getOrDefault(call.functionName(), List.of());
                    if (screens.isEmpty()) {
                        addOrigin(origins, seen, baseName(call.file()), call.file(),
                                call.functionName(), call.file(), ep, controller);
                    } else {
                        for (String screen : screens) {
                            addOrigin(origins, seen, baseName(screen), screen,
                                    call.functionName(), call.file(), ep, controller);
                        }
                    }
                    if (origins.size() >= MAX_MOBILE_ORIGINS) return origins;
                }
            }
        }
        return origins;
    }

    private void addOrigin(List<MobileOriginDto> origins, Set<String> seen,
                           String screenName, String screenFile, String apiFunction,
                           String apiFile, Endpoint ep, ParsedClass controller) {
        String key = screenFile + "|" + controller.getId() + "|" + apiFunction;
        if (!seen.add(key)) return;
        origins.add(new MobileOriginDto(
                screenName, screenFile, apiFunction, apiFile,
                ep.verb(), ep.path(), controller.getId(), controller.getFullyQualifiedName()));
    }

    private boolean verbMatches(String endpointVerb, String callVerb) {
        if (endpointVerb == null || endpointVerb.isBlank()) return true; // @RequestMapping any
        return endpointVerb.equalsIgnoreCase(callVerb);
    }

    /** Compare two normalized paths, tolerating an optional {@code /api} prefix
     *  on either side (RN baseURL may or may not include it). */
    private boolean pathsMatch(String a, String b) {
        if (a == null || b == null) return false;
        return stripApi(a).equals(stripApi(b));
    }

    private String stripApi(String p) {
        if (p.startsWith("/api/")) return p.substring(4);
        if (p.equals("/api")) return "/";
        return p;
    }

    private String baseName(String file) {
        String f = file.replace('\\', '/');
        String base = f.substring(f.lastIndexOf('/') + 1);
        int dot = base.indexOf('.');
        return dot > 0 ? base.substring(0, dot) : base;
    }

    private List<Path> collectJavaFiles(Path root) throws IOException {
        List<Path> files = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                if (!dir.equals(root) && ProjectInfoUtils.shouldExclude(dir)) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (file.getFileName().toString().endsWith(".java")) {
                    files.add(file);
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });
        return files;
    }
}
