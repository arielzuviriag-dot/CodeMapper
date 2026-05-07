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
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
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
 * Traces every class in the project that invokes a specific method on the
 * focus class. Emits the same SSE event shape as the regular FOCUS mode so
 * the frontend can reuse most of its rendering — only the central node is
 * a method (not a class) and the connection type is {@code INVOKES_METHOD}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FocusMethodTracerService {

    private final ClassExtractor classExtractor;
    private final FieldExtractor fieldExtractor;
    private final MethodExtractor methodExtractor;
    private final SymbolSolverConfigurer symbolSolverConfigurer;

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
        symbolSolverConfigurer.configure(projectRoot);
        sink.accept(new SessionStartEvent(session.getTotalFiles(), session.getProjectName(), start));

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

        // Snapshot the focus class itself in parsedClasses so the sheet can
        // request /source for it using the same id pattern as full-mode.
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

        // ─── Walk project, find every class that invokes this method ───
        List<Path> projectFiles = collectJavaFiles(projectRoot);
        Map<String, ParsedClass> callers = new LinkedHashMap<>();
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

            // Walk every method invocation in this file
            cu.findAll(MethodCallExpr.class).forEach(call -> {
                if (!call.getNameAsString().equals(methodName)) return;
                String resolvedDeclaringFqn;
                try {
                    resolvedDeclaringFqn = call.resolve().declaringType().getQualifiedName();
                } catch (Exception e) {
                    return; // can't be sure → skip rather than create a false positive
                }
                if (!focusFqn.equals(resolvedDeclaringFqn)) return;

                // Walk up to the TypeDeclaration containing the call site.
                TypeDeclaration<?> containingType = call.findAncestor(TypeDeclaration.class).orElse(null);
                if (containingType == null) return;

                String pkg = cu.getPackageDeclaration()
                        .map(p -> p.getNameAsString())
                        .orElse("");
                ParsedClass pc;
                try {
                    pc = classExtractor.extract(containingType, pkg, file.toString());
                } catch (Exception e) {
                    log.debug("Could not extract caller {}: {}", containingType.getNameAsString(), e.getMessage());
                    return;
                }

                if (focusFqn.equals(pc.getFullyQualifiedName())) return; // skip self-calls
                if (callers.containsKey(pc.getId())) return;             // already counted

                pc.setFields(fieldExtractor.extract(containingType));
                pc.setMethods(methodExtractor.extract(containingType));
                callers.put(pc.getId(), pc);
            });
        }

        List<ParsedClass> ordered = new ArrayList<>(callers.values());
        int totalAvailable = ordered.size();
        boolean limitApplied = !session.isPro() && totalAvailable > focusMethodMaxConnections;
        List<ParsedClass> toEmit = limitApplied
                ? ordered.subList(0, focusMethodMaxConnections)
                : ordered;

        log.info("FocusMethod session {}: {} callers found, pro={}, limitApplied={}",
                session.getSessionId(), totalAvailable, session.isPro(), limitApplied);

        int position = 0;
        for (ParsedClass pc : toEmit) {
            position++;
            session.getParsedClasses().add(pc); // makes /source available for caller
            sink.accept(new FocusConnectionEvent(
                    pc.getId(),
                    pc.getFullyQualifiedName(),
                    pc.getName(),
                    pc.getPackageName(),
                    pc.getType(),
                    pc.getAnnotations(),
                    FocusConnectionType.INVOKES_METHOD,
                    pc.getFields(),
                    pc.getMethods(),
                    position,
                    pc.getFilePath()
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

        log.info("FocusMethod session {} done: focus + {} callers in {} ms",
                session.getSessionId(), toEmit.size(), durationMs);
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
}
