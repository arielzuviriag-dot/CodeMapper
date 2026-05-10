package com.codemapper.parser;

import com.codemapper.service.ProjectInfoUtils;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.symbolsolver.JavaSymbolSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.CombinedTypeSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.JavaParserTypeSolver;
import com.github.javaparser.symbolsolver.resolution.typesolvers.ReflectionTypeSolver;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Wires StaticJavaParser with a CombinedTypeSolver that knows about every
 * `src/main/java` source root under the given project. Shared between
 * full-project parsing and focus tracing.
 */
@Slf4j
@Component
public class SymbolSolverConfigurer {

    public List<Path> configure(Path projectRoot) throws IOException {
        return configure(projectRoot, null);
    }

    /** Cap on how many CompilationUnits each JavaParserTypeSolver keeps
     *  cached. Without this the solver grows unbounded across analyses
     *  and OOMs the JVM after a few deep walks (default JVM heap on Spring
     *  Boot dev = ~512 MB, easily blown by a 200-class project's worth
     *  of fully-tokenized ASTs). */
    private static final long SOLVER_CACHE_LIMIT = 200;

    public List<Path> configure(Path projectRoot, String detectedJavaVersion) throws IOException {
        ParserConfiguration.LanguageLevel level = mapLanguageLevel(detectedJavaVersion);

        // Slim parser config — we don't need original tokens or comment
        // attribution for symbol resolution and call-graph extraction.
        // Turning these off cuts per-AST memory ~30-50%, which matters
        // when the type solver caches hundreds of CompilationUnits.
        ParserConfiguration solverParserConfig = new ParserConfiguration()
                .setLanguageLevel(level)
                .setStoreTokens(false)
                .setAttributeComments(false);

        CombinedTypeSolver combined = new CombinedTypeSolver();
        combined.add(new ReflectionTypeSolver());

        List<Path> sourceRoots = findSourceRoots(projectRoot);
        if (sourceRoots.isEmpty()) {
            try {
                combined.add(new JavaParserTypeSolver(
                        projectRoot, solverParserConfig, SOLVER_CACHE_LIMIT));
            } catch (Exception e) {
                log.debug("Could not register fallback source root {}: {}", projectRoot, e.getMessage());
            }
        } else {
            for (Path src : sourceRoots) {
                try {
                    combined.add(new JavaParserTypeSolver(
                            src, solverParserConfig, SOLVER_CACHE_LIMIT));
                } catch (Exception e) {
                    log.debug("Skipping source root {}: {}", src, e.getMessage());
                }
            }
        }

        // Same slim flags for direct StaticJavaParser calls (the FocusTracer
        // parses with StaticJavaParser, not through the solver).
        ParserConfiguration staticConfig = new ParserConfiguration()
                .setSymbolResolver(new JavaSymbolSolver(combined))
                .setLanguageLevel(level)
                .setStoreTokens(false)
                .setAttributeComments(false);
        StaticJavaParser.setConfiguration(staticConfig);

        log.info("Symbol solver configured with {} source root(s), language level {}, cache limit {} per solver",
                sourceRoots.size(), level, SOLVER_CACHE_LIMIT);
        return sourceRoots;
    }

    /** Maps a detected major Java version to the corresponding parser
     *  LanguageLevel. Falls back to BLEEDING_EDGE when the version is unknown
     *  or newer than what JavaParser 3.26.x recognizes by name. */
    private ParserConfiguration.LanguageLevel mapLanguageLevel(String javaVersion) {
        if (javaVersion == null || javaVersion.isBlank()) {
            return ParserConfiguration.LanguageLevel.BLEEDING_EDGE;
        }
        return switch (javaVersion.trim()) {
            case "8" -> ParserConfiguration.LanguageLevel.JAVA_8;
            case "9" -> ParserConfiguration.LanguageLevel.JAVA_9;
            case "10" -> ParserConfiguration.LanguageLevel.JAVA_10;
            case "11" -> ParserConfiguration.LanguageLevel.JAVA_11;
            case "12" -> ParserConfiguration.LanguageLevel.JAVA_12;
            case "13" -> ParserConfiguration.LanguageLevel.JAVA_13;
            case "14" -> ParserConfiguration.LanguageLevel.JAVA_14;
            case "15" -> ParserConfiguration.LanguageLevel.JAVA_15;
            case "16" -> ParserConfiguration.LanguageLevel.JAVA_16;
            case "17" -> ParserConfiguration.LanguageLevel.JAVA_17;
            default -> ParserConfiguration.LanguageLevel.BLEEDING_EDGE;
        };
    }

    private List<Path> findSourceRoots(Path root) throws IOException {
        List<Path> sources = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                if (!dir.equals(root) && ProjectInfoUtils.shouldExclude(dir)) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                int n = dir.getNameCount();
                if (n >= 3) {
                    Path tail = dir.subpath(n - 3, n);
                    if (tail.equals(Path.of("src", "main", "java"))) {
                        sources.add(dir);
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });
        sources.sort(Comparator.comparingInt(Path::getNameCount));
        return sources;
    }
}
