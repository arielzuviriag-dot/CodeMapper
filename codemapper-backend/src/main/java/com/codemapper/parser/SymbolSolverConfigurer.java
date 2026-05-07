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
        CombinedTypeSolver combined = new CombinedTypeSolver();
        combined.add(new ReflectionTypeSolver());

        List<Path> sourceRoots = findSourceRoots(projectRoot);
        if (sourceRoots.isEmpty()) {
            try {
                combined.add(new JavaParserTypeSolver(projectRoot.toFile()));
            } catch (Exception e) {
                log.debug("Could not register fallback source root {}: {}", projectRoot, e.getMessage());
            }
        } else {
            for (Path src : sourceRoots) {
                try {
                    combined.add(new JavaParserTypeSolver(src.toFile()));
                } catch (Exception e) {
                    log.debug("Skipping source root {}: {}", src, e.getMessage());
                }
            }
        }

        ParserConfiguration config = new ParserConfiguration()
                .setSymbolResolver(new JavaSymbolSolver(combined))
                .setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_17);
        StaticJavaParser.setConfiguration(config);

        log.info("Symbol solver configured with {} source root(s)", sourceRoots.size());
        return sourceRoots;
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
