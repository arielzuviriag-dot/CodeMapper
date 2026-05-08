package com.codemapper.service;

import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.domain.ParsedClass;
import com.codemapper.model.domain.ParsedMethod;
import com.codemapper.model.domain.SessionData;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.ErrorEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import com.codemapper.model.event.FocusMethodLoadedEvent;
import com.codemapper.model.event.LimitReachedEvent;
import com.codemapper.model.event.SessionCompleteEvent;
import com.codemapper.model.event.SessionStartEvent;
import com.codemapper.parser.ClassExtractor;
import com.codemapper.parser.FieldExtractor;
import com.codemapper.parser.MethodExtractor;
import com.codemapper.parser.SymbolSolverConfigurer;
import com.github.javaparser.Range;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.stmt.CatchClause;
import com.github.javaparser.ast.stmt.DoStmt;
import com.github.javaparser.ast.stmt.ForEachStmt;
import com.github.javaparser.ast.stmt.ForStmt;
import com.github.javaparser.ast.stmt.IfStmt;
import com.github.javaparser.ast.stmt.SwitchEntry;
import com.github.javaparser.ast.stmt.TryStmt;
import com.github.javaparser.ast.stmt.WhileStmt;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/**
 * Method-level FOCUS tracer. Around the focus method on the focus class,
 * emits two sides of the call relationship:
 *
 * <ul>
 *   <li><b>Incoming</b> ({@link FocusConnectionType#INVOKES_METHOD}) — every
 *   class in the project that invokes the method. The {@code viaMethodInSource}
 *   field carries the method on the caller class that produces the call.</li>
 *   <li><b>Outgoing</b> ({@link FocusConnectionType#INVOKES_OUTGOING}) — every
 *   class invoked from inside the focus method body, deduped by target FQN.
 *   {@code viaMethodInTarget} is the called method's simple name; {@code
 *   controlContext} is set when the call sits inside an if/loop/try/switch
 *   so the frontend can decorate the edge accordingly.</li>
 * </ul>
 *
 * The combined cap (incoming + outgoing) is bounded by
 * {@code codemapper.limits.focus-method-max-connections} for FREE sessions;
 * PRO is unlimited.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FocusMethodTracerService {

    private final ClassExtractor classExtractor;
    private final FieldExtractor fieldExtractor;
    private final MethodExtractor methodExtractor;
    private final SymbolSolverConfigurer symbolSolverConfigurer;
    private final JavaVersionDetector javaVersionDetector;

    @Value("${codemapper.limits.focus-method-max-connections:10}")
    private int focusMethodMaxConnections;

    public void traceMethod(SessionData session, Consumer<BaseEvent> sink) throws IOException {
        Instant start = Instant.now();
        Path projectRoot = session.getProjectPath();
        Path focusPath = session.getFocusFile();
        String methodName = session.getFocusMethodName();

        if (focusPath == null) {
            throw new IllegalStateException("Focus file path is missing on session " + session.getSessionId());
        }
        if (methodName == null || methodName.isBlank()) {
            throw new IllegalStateException("Focus method name is missing on session " + session.getSessionId());
        }
        if (!Files.exists(focusPath) || !Files.isRegularFile(focusPath)) {
            throw new IllegalArgumentException("Focus file does not exist: " + focusPath);
        }

        session.setStatus(SessionData.Status.PARSING);
        String detectedJavaVersion = javaVersionDetector.detect(projectRoot);
        session.setDetectedJavaVersion(detectedJavaVersion);
        symbolSolverConfigurer.configure(projectRoot, detectedJavaVersion);
        sink.accept(new SessionStartEvent(session.getTotalFiles(), session.getProjectName(), start, detectedJavaVersion));

        // ─── Parse focus class + locate the method ─────────────────────
        CompilationUnit focusCu;
        try {
            focusCu = StaticJavaParser.parse(focusPath.toFile());
        } catch (Exception e) {
            sink.accept(new ErrorEvent("Failed to parse focus file: " + e.getMessage(),
                    null, focusPath.toString()));
            session.setStatus(SessionData.Status.FAILED);
            throw new IOException("Failed to parse focus file", e);
        }

        TypeDeclaration<?> focusType = focusCu.getTypes().stream()
                .findFirst()
                .orElse(null);
        if (focusType == null) {
            sink.accept(new ErrorEvent("Focus file has no type declaration", null, focusPath.toString()));
            session.setStatus(SessionData.Status.FAILED);
            return;
        }

        String focusFqn = focusType.getFullyQualifiedName().orElseGet(focusType::getNameAsString);
        String containingClassName = focusType.getNameAsString();
        String containingClassPackage = focusCu.getPackageDeclaration()
                .map(p -> p.getNameAsString())
                .orElse("");

        // First overload wins. Real overload resolution would need parameter types from
        // the click context — a v2 concern; for now all overloads under one tracer.
        MethodDeclaration md = focusType.getMethods().stream()
                .filter(m -> m.getNameAsString().equals(methodName))
                .findFirst()
                .orElse(null);
        if (md == null) {
            sink.accept(new ErrorEvent(
                    "Method '" + methodName + "' not found in focus class " + focusFqn,
                    null, focusPath.toString()));
            session.setStatus(SessionData.Status.FAILED);
            return;
        }

        ParsedClass focusParsed = classExtractor.extract(focusType, containingClassPackage, focusPath.toString());
        focusParsed.setFields(fieldExtractor.extract(focusType));
        focusParsed.setMethods(methodExtractor.extract(focusType));
        session.getParsedClasses().add(focusParsed);

        Range range = md.getRange().orElse(null);
        int startLine = range != null ? range.begin.line : 0;
        int endLine = range != null ? range.end.line : 0;
        String fileSource = Files.readString(focusPath);
        String methodSource = sliceLines(fileSource, startLine, endLine);

        List<ParsedMethod.Parameter> parameters = md.getParameters().stream()
                .map(p -> new ParsedMethod.Parameter(p.getNameAsString(), p.getTypeAsString()))
                .collect(Collectors.toCollection(ArrayList::new));

        sink.accept(new FocusMethodLoadedEvent(
                focusFqn + "#" + methodName,
                containingClassName,
                focusFqn,
                containingClassPackage,
                methodName,
                md.getDeclarationAsString(),
                md.getTypeAsString(),
                parameters,
                methodSource,
                Math.max(endLine - startLine + 1, 0),
                startLine,
                endLine
        ));

        // ─── Walk project once: build FQN registry + collect callers ────
        // Single pass keeps the outgoing side's target lookup cheap (in-memory
        // map) instead of re-walking the project for every distinct call.
        List<Path> projectFiles = collectJavaFiles(projectRoot);
        Map<String, ParsedClass> classByFqn = new LinkedHashMap<>();
        Map<String, IncomingCaller> callers = new LinkedHashMap<>();
        log.info("FocusMethod session {}: scanning {} java files for callers of {}#{}",
                session.getSessionId(), projectFiles.size(), focusFqn, methodName);

        for (Path file : projectFiles) {
            CompilationUnit cu;
            try {
                cu = StaticJavaParser.parse(file.toFile());
            } catch (Exception e) {
                log.debug("Skipping unparseable file {}: {}", file, e.getMessage());
                continue;
            }
            String pkg = cu.getPackageDeclaration()
                    .map(p -> p.getNameAsString())
                    .orElse("");

            for (TypeDeclaration<?> td : cu.getTypes()) {
                try {
                    ParsedClass pc = classExtractor.extract(td, pkg, file.toString());
                    pc.setFields(fieldExtractor.extract(td));
                    pc.setMethods(methodExtractor.extract(td));
                    classByFqn.putIfAbsent(pc.getFullyQualifiedName(), pc);
                } catch (Exception e) {
                    log.debug("Skipping type in {}: {}", file, e.getMessage());
                }
            }

            cu.findAll(MethodCallExpr.class).forEach(call -> {
                if (!call.getNameAsString().equals(methodName)) return;
                String resolvedDeclaringFqn;
                try {
                    resolvedDeclaringFqn = call.resolve().declaringType().getQualifiedName();
                } catch (Exception e) {
                    return;
                }
                if (!focusFqn.equals(resolvedDeclaringFqn)) return;

                TypeDeclaration<?> containingType = call.findAncestor(TypeDeclaration.class).orElse(null);
                if (containingType == null) return;
                String tdFqn = containingType.getFullyQualifiedName().orElse(null);
                if (tdFqn == null || focusFqn.equals(tdFqn)) return;

                ParsedClass pc = classByFqn.get(tdFqn);
                if (pc == null) return;
                if (callers.containsKey(pc.getId())) return;

                String via = call.findAncestor(MethodDeclaration.class)
                        .map(MethodDeclaration::getNameAsString)
                        .orElse(null);
                callers.put(pc.getId(), new IncomingCaller(pc, via));
            });
        }

        // ─── Outgoing side: scan focus method body ──────────────────────
        // Deduped by target FQN — first call site wins for via-method +
        // control context. (Multi-site rendering is a v2 concern.)
        Map<String, OutgoingCall> outgoing = new LinkedHashMap<>();
        for (MethodCallExpr call : md.findAll(MethodCallExpr.class)) {
            String targetFqn;
            try {
                targetFqn = call.resolve().declaringType().getQualifiedName();
            } catch (Exception e) {
                continue;
            }
            if (targetFqn == null || targetFqn.isBlank()) continue;
            if (focusFqn.equals(targetFqn)) continue; // skip self-calls within focus class
            // Skip JDK + jakarta/javax — won't be in classByFqn anyway, but
            // resolving them is wasted effort on the outgoing side.
            if (targetFqn.startsWith("java.") || targetFqn.startsWith("javax.")
                    || targetFqn.startsWith("jakarta.")) continue;
            if (outgoing.containsKey(targetFqn)) continue;

            ParsedClass target = classByFqn.get(targetFqn);
            if (target == null) continue; // out of project scope (likely a dependency lib)

            String calledMethodName = call.getNameAsString();
            String controlContext = resolveControlContext(call, md);
            outgoing.put(targetFqn, new OutgoingCall(target, calledMethodName, controlContext));
        }

        // ─── Combine + cap (free 10 / pro unlimited) ────────────────────
        List<EmittableConnection> ordered = new ArrayList<>();
        for (IncomingCaller caller : callers.values()) {
            ordered.add(new EmittableConnection(
                    caller.classData(),
                    FocusConnectionType.INVOKES_METHOD,
                    caller.viaMethodInCaller(),
                    methodName,
                    null));
        }
        for (OutgoingCall out : outgoing.values()) {
            ordered.add(new EmittableConnection(
                    out.target(),
                    FocusConnectionType.INVOKES_OUTGOING,
                    methodName, // viaInSource = focus method (origin of the call)
                    out.calledMethodName(),
                    out.controlContext()));
        }

        int totalAvailable = ordered.size();
        boolean limitApplied = !session.isPro() && totalAvailable > focusMethodMaxConnections;
        List<EmittableConnection> toEmit = limitApplied
                ? ordered.subList(0, focusMethodMaxConnections)
                : ordered;

        log.info("FocusMethod session {}: {} total ({} incoming, {} outgoing), pro={}, limitApplied={}",
                session.getSessionId(), totalAvailable, callers.size(), outgoing.size(),
                session.isPro(), limitApplied);

        int position = 0;
        for (EmittableConnection ec : toEmit) {
            position++;
            session.getParsedClasses().add(ec.parsed());
            sink.accept(new FocusConnectionEvent(
                    ec.parsed().getId(),
                    ec.parsed().getFullyQualifiedName(),
                    ec.parsed().getName(),
                    ec.parsed().getPackageName(),
                    ec.parsed().getType(),
                    ec.parsed().getAnnotations(),
                    ec.connectionType(),
                    ec.parsed().getFields(),
                    ec.parsed().getMethods(),
                    position,
                    ec.parsed().getFilePath(),
                    ec.viaMethodInSource(),
                    ec.viaMethodInTarget(),
                    ec.controlContext(),
                    false,
                    false
            ));
            try {
                Thread.sleep(60);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                log.warn("FocusMethod tracing interrupted for session {}", session.getSessionId());
                return;
            }
        }

        if (limitApplied) {
            sink.accept(new LimitReachedEvent(
                    focusMethodMaxConnections,
                    totalAvailable,
                    toEmit.size(),
                    "Llegaste al límite de la versión FREE"));
        }

        long durationMs = Duration.between(start, Instant.now()).toMillis();
        sink.accept(new SessionCompleteEvent(
                1 + toEmit.size(),
                toEmit.size(),
                durationMs));
        session.setStatus(SessionData.Status.COMPLETED);

        log.info("FocusMethod session {} done: focus + {} connections in {} ms",
                session.getSessionId(), toEmit.size(), durationMs);
    }

    /**
     * Walks parents of {@code call} up to (but not including) {@code owner},
     * stopping at the first control-flow ancestor. Returns:
     * <ul>
     *   <li>{@code IF_THEN} — call sits in the then branch (or condition) of an if</li>
     *   <li>{@code IF_ELSE} — call sits in the else branch of an if</li>
     *   <li>{@code LOOP} — call inside for, for-each, while or do-while</li>
     *   <li>{@code TRY} / {@code CATCH} — call inside a try body or catch clause</li>
     *   <li>{@code SWITCH_CASE} — call inside a switch entry</li>
     *   <li>{@code null} — call is in the linear top-level body</li>
     * </ul>
     * The innermost wrapper wins (a call inside {@code if(...) { for(...) { x(); } }}
     * comes back as {@code LOOP}).
     */
    private String resolveControlContext(MethodCallExpr call, MethodDeclaration owner) {
        Node prev = call;
        Node cur = call.getParentNode().orElse(null);
        while (cur != null && cur != owner) {
            if (cur instanceof IfStmt ifStmt) {
                if (ifStmt.getElseStmt().isPresent() && ifStmt.getElseStmt().get() == prev) {
                    return "IF_ELSE";
                }
                return "IF_THEN";
            }
            if (cur instanceof ForStmt || cur instanceof ForEachStmt
                    || cur instanceof WhileStmt || cur instanceof DoStmt) {
                return "LOOP";
            }
            if (cur instanceof CatchClause) return "CATCH";
            if (cur instanceof TryStmt) return "TRY";
            if (cur instanceof SwitchEntry) return "SWITCH_CASE";
            prev = cur;
            cur = cur.getParentNode().orElse(null);
        }
        return null;
    }

    private static String sliceLines(String source, int startLine, int endLine) {
        if (startLine <= 0 || endLine <= 0 || endLine < startLine) return "";
        String[] lines = source.split("\n", -1);
        StringBuilder sb = new StringBuilder();
        int from = Math.max(0, startLine - 1);
        int to = Math.min(lines.length, endLine);
        for (int i = from; i < to; i++) {
            sb.append(lines[i]);
            if (i < to - 1) sb.append('\n');
        }
        return sb.toString();
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

    private record IncomingCaller(ParsedClass classData, String viaMethodInCaller) {}

    private record OutgoingCall(ParsedClass target, String calledMethodName, String controlContext) {}

    private record EmittableConnection(
            ParsedClass parsed,
            FocusConnectionType connectionType,
            String viaMethodInSource,
            String viaMethodInTarget,
            String controlContext) {}
}
