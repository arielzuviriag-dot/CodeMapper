package com.codemapper.service;

import com.codemapper.model.domain.Connection;
import com.codemapper.model.domain.ParsedClass;
import com.codemapper.model.domain.ParsedField;
import com.codemapper.model.domain.ParsedMethod;
import com.codemapper.model.domain.SessionData;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.ClassFoundEvent;
import com.codemapper.model.event.ConnectionFoundEvent;
import com.codemapper.model.event.ErrorEvent;
import com.codemapper.model.event.FieldsParsedEvent;
import com.codemapper.model.event.LimitReachedEvent;
import com.codemapper.model.event.MethodsParsedEvent;
import com.codemapper.model.event.PackageFoundEvent;
import com.codemapper.model.event.SessionCompleteEvent;
import com.codemapper.model.event.SessionStartEvent;
import com.codemapper.parser.ClassExtractor;
import com.codemapper.parser.ConnectionResolver;
import com.codemapper.parser.FieldExtractor;
import com.codemapper.parser.MethodExtractor;
import com.codemapper.parser.SymbolSolverConfigurer;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.TypeDeclaration;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

@Slf4j
@Service
@RequiredArgsConstructor
public class JavaParserService {

    private final ClassExtractor classExtractor;
    private final FieldExtractor fieldExtractor;
    private final MethodExtractor methodExtractor;
    private final ConnectionResolver connectionResolver;
    private final SymbolSolverConfigurer symbolSolverConfigurer;
    private final JavaVersionDetector javaVersionDetector;

    @Value("${codemapper.limits.free-max-files:100}")
    private int freeMaxFiles;

    public void parseProject(SessionData session, Consumer<BaseEvent> sink) throws IOException {
        Instant start = Instant.now();
        Path projectRoot = session.getProjectPath();
        session.setStatus(SessionData.Status.PARSING);

        String detectedJavaVersion = javaVersionDetector.detect(projectRoot);
        session.setDetectedJavaVersion(detectedJavaVersion);
        symbolSolverConfigurer.configure(projectRoot, detectedJavaVersion);

        sink.accept(new SessionStartEvent(session.getTotalFiles(), session.getProjectName(), start, detectedJavaVersion));

        Set<String> seenPackages = new HashSet<>();
        List<ConnectionResolver.TypedClass> typedClasses = new ArrayList<>();

        List<Path> allJavaFiles = collectJavaFiles(projectRoot);
        int totalAvailable = allJavaFiles.size();

        boolean limitApplied = !session.isPro() && totalAvailable > freeMaxFiles;
        List<Path> javaFiles = limitApplied
                ? allJavaFiles.subList(0, freeMaxFiles)
                : allJavaFiles;

        log.info("Session {}: parsing {} of {} java files (pro={}, limitApplied={})",
                session.getSessionId(), javaFiles.size(), totalAvailable, session.isPro(), limitApplied);

        for (Path file : javaFiles) {
            CompilationUnit cu;
            try {
                cu = StaticJavaParser.parse(file.toFile());
            } catch (Exception e) {
                log.warn("Failed to parse file {}: {}", file, e.getMessage());
                sink.accept(new ErrorEvent("Failed to parse file: " + e.getMessage(), null, file.toString()));
                continue;
            }

            String pkg = cu.getPackageDeclaration()
                    .map(p -> p.getNameAsString())
                    .orElse("");
            if (!pkg.isEmpty() && seenPackages.add(pkg)) {
                sink.accept(new PackageFoundEvent(pkg));
            }

            for (TypeDeclaration<?> type : cu.getTypes()) {
                String classId = null;
                try {
                    ParsedClass parsed = classExtractor.extract(type, pkg, file.toString());
                    classId = parsed.getId();
                    session.getParsedClasses().add(parsed);
                    typedClasses.add(new ConnectionResolver.TypedClass(parsed, type));

                    sink.accept(new ClassFoundEvent(
                            parsed.getId(),
                            parsed.getName(),
                            parsed.getFullyQualifiedName(),
                            parsed.getPackageName(),
                            parsed.getType(),
                            parsed.getAnnotations(),
                            parsed.getFilePath(),
                            parsed.getLineCount(),
                            parsed.getModifiers()
                    ));

                    try {
                        Thread.sleep(40);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        log.warn("Parsing interrupted for session {}", session.getSessionId());
                        return;
                    }

                    List<ParsedField> fields = fieldExtractor.extract(type);
                    parsed.setFields(fields);
                    sink.accept(new FieldsParsedEvent(parsed.getId(), fields));

                    List<ParsedMethod> methods = methodExtractor.extract(type);
                    parsed.setMethods(methods);
                    sink.accept(new MethodsParsedEvent(parsed.getId(), methods));

                } catch (Exception e) {
                    log.warn("Failed to extract type {} in {}: {}",
                            type.getNameAsString(), file, e.getMessage());
                    sink.accept(new ErrorEvent(
                            "Failed to extract class: " + e.getMessage(),
                            classId,
                            file.toString()));
                }
            }
        }

        if (limitApplied) {
            sink.accept(new LimitReachedEvent(
                    freeMaxFiles,
                    totalAvailable,
                    javaFiles.size(),
                    "Llegaste al límite de la versión FREE"));
            log.info("Session {}: FREE limit reached ({} of {} files parsed)",
                    session.getSessionId(), javaFiles.size(), totalAvailable);
        }

        Map<String, ParsedClass> byId = new LinkedHashMap<>();
        for (ParsedClass pc : session.getParsedClasses()) {
            byId.putIfAbsent(pc.getId(), pc);
        }
        List<Connection> connections = connectionResolver.resolve(typedClasses, byId);
        session.getConnections().addAll(connections);

        for (Connection c : connections) {
            sink.accept(new ConnectionFoundEvent(c.getFrom(), c.getTo(), c.getType(), c.getLabel()));
        }

        long durationMs = Duration.between(start, Instant.now()).toMillis();
        sink.accept(new SessionCompleteEvent(
                session.getParsedClasses().size(),
                connections.size(),
                durationMs));
        session.setStatus(SessionData.Status.COMPLETED);

        log.info("Session {} parsed: {} classes, {} connections, {} ms",
                session.getSessionId(),
                session.getParsedClasses().size(),
                connections.size(),
                durationMs);
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
