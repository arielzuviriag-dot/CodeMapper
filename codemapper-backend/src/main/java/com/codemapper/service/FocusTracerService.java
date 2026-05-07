package com.codemapper.service;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.domain.ParsedClass;
import com.codemapper.model.domain.SessionData;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.ErrorEvent;
import com.codemapper.model.event.FocusClassLoadedEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import com.codemapper.model.event.LimitReachedEvent;
import com.codemapper.model.event.SessionCompleteEvent;
import com.codemapper.model.event.SessionStartEvent;
import com.codemapper.parser.ClassExtractor;
import com.codemapper.parser.FieldExtractor;
import com.codemapper.parser.MethodExtractor;
import com.codemapper.parser.SymbolSolverConfigurer;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.resolution.types.ResolvedType;
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
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;

/**
 * Level-1 dependency tracer for FOCUS mode. Given one .java file as the
 * "focus", it streams the focus class itself and every directly related
 * class in the project (EXTENDS / IMPLEMENTS / CALLED_BY / CALLS) plus
 * referenced configuration files (USES_PROPERTIES). It does NOT traverse
 * beyond level 1 — nested dependencies are out of scope here.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FocusTracerService {

    private static final Set<String> PROPERTY_TRIGGER_ANNOTATIONS = Set.of(
            "Value", "ConfigurationProperties", "PropertySource", "PropertySources"
    );

    private final ClassExtractor classExtractor;
    private final FieldExtractor fieldExtractor;
    private final MethodExtractor methodExtractor;
    private final SymbolSolverConfigurer symbolSolverConfigurer;

    @Value("${codemapper.limits.focus-max-connections:10}")
    private int focusMaxConnections;

    public void traceFocus(SessionData session, Consumer<BaseEvent> sink) throws IOException {
        Instant start = Instant.now();
        Path projectRoot = session.getProjectPath();
        Path focusPath = session.getFocusFile();

        if (focusPath == null) {
            throw new IllegalStateException("Focus file path is missing on session " + session.getSessionId());
        }
        if (!Files.exists(focusPath) || !Files.isRegularFile(focusPath)) {
            throw new IllegalArgumentException("Focus file does not exist: " + focusPath);
        }
        if (!focusPath.getFileName().toString().endsWith(".java")) {
            throw new IllegalArgumentException("Focus file must be a .java file: " + focusPath);
        }

        session.setStatus(SessionData.Status.PARSING);
        symbolSolverConfigurer.configure(projectRoot);

        sink.accept(new SessionStartEvent(session.getTotalFiles(), session.getProjectName(), start));

        // ─── Parse focus ─────────────────────────────────────────────────
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

        String focusPackage = focusCu.getPackageDeclaration()
                .map(p -> p.getNameAsString())
                .orElse("");
        ParsedClass focusParsed = classExtractor.extract(focusType, focusPackage, focusPath.toString());
        focusParsed.setFields(fieldExtractor.extract(focusType));
        focusParsed.setMethods(methodExtractor.extract(focusType));
        session.getParsedClasses().add(focusParsed);

        List<String> extendsList = collectExtendsFqns(focusType);
        List<String> implementsList = collectImplementsFqns(focusType);
        Set<String> focusOutgoingFqns = collectAllReferencedFqns(focusType);
        boolean focusUsesProperties = hasPropertyAnnotations(focusType);
        String focusFqn = focusParsed.getFullyQualifiedName();

        sink.accept(new FocusClassLoadedEvent(
                focusParsed.getId(),
                focusParsed.getFullyQualifiedName(),
                focusParsed.getName(),
                focusParsed.getPackageName(),
                focusParsed.getType(),
                focusParsed.getAnnotations(),
                focusParsed.getModifiers(),
                focusParsed.getFields(),
                focusParsed.getMethods(),
                implementsList,
                extendsList.isEmpty() ? null : extendsList.get(0),
                focusPath.toString(),
                focusParsed.getLineCount()
        ));

        // ─── Walk project + classify each non-focus class ───────────────
        List<Path> projectFiles = collectJavaFiles(projectRoot);
        log.info("Focus session {}: scanning {} java files for relationships to {}",
                session.getSessionId(), projectFiles.size(), focusFqn);

        List<PendingConnection> extendsImplements = new ArrayList<>();
        List<PendingConnection> calledBy = new ArrayList<>();
        List<PendingConnection> calls = new ArrayList<>();

        for (Path file : projectFiles) {
            if (file.toAbsolutePath().normalize().equals(focusPath.toAbsolutePath().normalize())) {
                continue;
            }
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
                ParsedClass pc;
                try {
                    pc = classExtractor.extract(td, pkg, file.toString());
                    pc.setFields(fieldExtractor.extract(td));
                    pc.setMethods(methodExtractor.extract(td));
                } catch (Exception e) {
                    log.debug("Skipping type in {}: {}", file, e.getMessage());
                    continue;
                }
                if (focusFqn.equals(pc.getFullyQualifiedName())) {
                    continue;
                }

                // Priority: EXTENDS > IMPLEMENTS > CALLED_BY > CALLS
                if (extendsList.contains(pc.getFullyQualifiedName())) {
                    extendsImplements.add(new PendingConnection(pc, FocusConnectionType.EXTENDS));
                    continue;
                }
                if (implementsList.contains(pc.getFullyQualifiedName())) {
                    extendsImplements.add(new PendingConnection(pc, FocusConnectionType.IMPLEMENTS));
                    continue;
                }
                Set<String> incoming = collectAllReferencedFqns(td);
                if (incoming.contains(focusFqn)) {
                    calledBy.add(new PendingConnection(pc, FocusConnectionType.CALLED_BY));
                    continue;
                }
                if (focusOutgoingFqns.contains(pc.getFullyQualifiedName())) {
                    calls.add(new PendingConnection(pc, FocusConnectionType.CALLS));
                }
            }
        }

        List<PendingConnection> usesProperties = new ArrayList<>();
        if (focusUsesProperties) {
            for (Path propFile : findPropertyFiles(projectRoot)) {
                usesProperties.add(PendingConnection.fromPropertyFile(propFile, projectRoot));
            }
        }

        // ─── Order: EXTENDS+IMPLEMENTS, CALLED_BY, CALLS, USES_PROPERTIES ──
        List<PendingConnection> ordered = new ArrayList<>();
        ordered.addAll(extendsImplements);
        ordered.addAll(calledBy);
        ordered.addAll(calls);
        ordered.addAll(usesProperties);

        int totalAvailable = ordered.size();
        boolean limitApplied = !session.isPro() && totalAvailable > focusMaxConnections;
        List<PendingConnection> toEmit = limitApplied
                ? ordered.subList(0, focusMaxConnections)
                : ordered;

        log.info("Focus session {}: {} relationships found ({} extends/implements, {} called_by, {} calls, {} properties), pro={}, limitApplied={}",
                session.getSessionId(),
                totalAvailable,
                extendsImplements.size(),
                calledBy.size(),
                calls.size(),
                usesProperties.size(),
                session.isPro(),
                limitApplied);

        int position = 0;
        for (PendingConnection pc : toEmit) {
            position++;
            // Persist real class peripherals so /api/analyze/source/{sessionId}/{classId}
            // can serve their source when the user clicks the node in the graph.
            // Synthetic property-file entries have no real .java file → skip them.
            if (pc.connectionType != FocusConnectionType.USES_PROPERTIES) {
                session.getParsedClasses().add(pc.parsed);
            }
            sink.accept(new FocusConnectionEvent(
                    pc.parsed.getId(),
                    pc.parsed.getFullyQualifiedName(),
                    pc.parsed.getName(),
                    pc.parsed.getPackageName(),
                    pc.parsed.getType(),
                    pc.parsed.getAnnotations(),
                    pc.connectionType,
                    pc.parsed.getFields(),
                    pc.parsed.getMethods(),
                    position,
                    pc.parsed.getFilePath()
            ));
            try {
                Thread.sleep(60);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                log.warn("Focus tracing interrupted for session {}", session.getSessionId());
                return;
            }
        }

        if (limitApplied) {
            sink.accept(new LimitReachedEvent(
                    focusMaxConnections,
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

        log.info("Focus session {} done: focus + {} connections in {} ms",
                session.getSessionId(), toEmit.size(), durationMs);
    }

    // ───────────────────────────── helpers ────────────────────────────

    private static class PendingConnection {
        final ParsedClass parsed;
        final FocusConnectionType connectionType;

        PendingConnection(ParsedClass parsed, FocusConnectionType connectionType) {
            this.parsed = parsed;
            this.connectionType = connectionType;
        }

        static PendingConnection fromPropertyFile(Path file, Path projectRoot) {
            ParsedClass synthetic = new ParsedClass();
            String fileName = file.getFileName().toString();
            String relative;
            try {
                relative = projectRoot.relativize(file).toString().replace('\\', '/');
            } catch (IllegalArgumentException e) {
                relative = file.toString();
            }
            synthetic.setName(fileName);
            synthetic.setPackageName(relative);
            synthetic.setFullyQualifiedName(relative);
            synthetic.setId("prop-" + relative.replace('/', '-').replace('.', '_'));
            synthetic.setType(ClassType.CLASS);
            synthetic.setFilePath(file.toString());
            synthetic.setAnnotations(Collections.emptyList());
            synthetic.setModifiers(Collections.emptyList());
            synthetic.setFields(Collections.emptyList());
            synthetic.setMethods(Collections.emptyList());
            return new PendingConnection(synthetic, FocusConnectionType.USES_PROPERTIES);
        }
    }

    private List<String> collectExtendsFqns(TypeDeclaration<?> td) {
        List<String> result = new ArrayList<>();
        if (td instanceof ClassOrInterfaceDeclaration coi) {
            for (ClassOrInterfaceType ext : coi.getExtendedTypes()) {
                resolveTypeFqn(ext).ifPresent(result::add);
            }
        }
        return result;
    }

    private List<String> collectImplementsFqns(TypeDeclaration<?> td) {
        List<String> result = new ArrayList<>();
        if (td instanceof ClassOrInterfaceDeclaration coi) {
            for (ClassOrInterfaceType impl : coi.getImplementedTypes()) {
                resolveTypeFqn(impl).ifPresent(result::add);
            }
        }
        return result;
    }

    /**
     * FQNs of every external type referenced by this declaration through
     * its fields, method signatures, and constructor signatures. Method
     * bodies are intentionally skipped — symbol resolution there is costly
     * and noisy for level-1 tracing.
     */
    private Set<String> collectAllReferencedFqns(TypeDeclaration<?> td) {
        Set<String> result = new LinkedHashSet<>();

        for (FieldDeclaration field : td.getFields()) {
            for (VariableDeclarator var : field.getVariables()) {
                collectTypeFqnsRec(var.getType(), result);
            }
        }
        for (var member : td.getMembers()) {
            if (member instanceof MethodDeclaration md) {
                collectTypeFqnsRec(md.getType(), result);
                for (Parameter p : md.getParameters()) {
                    collectTypeFqnsRec(p.getType(), result);
                }
            } else if (member instanceof ConstructorDeclaration cd) {
                for (Parameter p : cd.getParameters()) {
                    collectTypeFqnsRec(p.getType(), result);
                }
            }
        }
        if (td instanceof ClassOrInterfaceDeclaration coi) {
            for (ClassOrInterfaceType ext : coi.getExtendedTypes()) {
                resolveTypeFqn(ext).ifPresent(result::add);
            }
            for (ClassOrInterfaceType impl : coi.getImplementedTypes()) {
                resolveTypeFqn(impl).ifPresent(result::add);
            }
        }
        return result;
    }

    private boolean hasPropertyAnnotations(TypeDeclaration<?> td) {
        if (matchesPropertyAnnotation(td.getAnnotations())) {
            return true;
        }
        for (FieldDeclaration field : td.getFields()) {
            if (matchesPropertyAnnotation(field.getAnnotations())) {
                return true;
            }
        }
        for (var member : td.getMembers()) {
            if (member instanceof MethodDeclaration md
                    && matchesPropertyAnnotation(md.getAnnotations())) {
                return true;
            }
        }
        return false;
    }

    private boolean matchesPropertyAnnotation(List<AnnotationExpr> annotations) {
        for (AnnotationExpr a : annotations) {
            if (PROPERTY_TRIGGER_ANNOTATIONS.contains(a.getNameAsString())) {
                return true;
            }
        }
        return false;
    }

    private List<Path> findPropertyFiles(Path root) throws IOException {
        List<Path> result = new ArrayList<>();
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
                String name = file.getFileName().toString().toLowerCase();
                if (name.endsWith(".properties") || name.endsWith(".yml") || name.endsWith(".yaml")) {
                    if (file.toString().replace('\\', '/').contains("/src/main/resources/")) {
                        result.add(file);
                    }
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });
        return result;
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

    private Optional<String> resolveTypeFqn(ClassOrInterfaceType type) {
        try {
            ResolvedType resolved = type.resolve();
            if (resolved.isReferenceType()) {
                return Optional.ofNullable(resolved.asReferenceType().getQualifiedName());
            }
        } catch (Exception e) {
            log.trace("Could not resolve type {}: {}", type, e.getMessage());
        }
        return Optional.empty();
    }

    private void collectTypeFqnsRec(Type type, Set<String> out) {
        if (type == null || !type.isClassOrInterfaceType()) {
            return;
        }
        ClassOrInterfaceType cot = type.asClassOrInterfaceType();
        try {
            ResolvedType resolved = cot.resolve();
            if (resolved.isReferenceType()) {
                String fqn = resolved.asReferenceType().getQualifiedName();
                if (fqn != null) {
                    out.add(fqn);
                }
            }
        } catch (Exception e) {
            log.trace("Could not resolve type {}: {}", cot, e.getMessage());
        }
        cot.getTypeArguments().ifPresent(args -> {
            for (Type arg : args) {
                collectTypeFqnsRec(arg, out);
            }
        });
    }
}
