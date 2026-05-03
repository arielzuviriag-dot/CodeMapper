package com.codemapper.service;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Comparator;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class ProjectInfoUtils {

    public static final Set<String> EXCLUDED_DIRS = Set.of(
            "target", "build", ".git", ".idea", ".vscode", "node_modules", ".mvn", "out", "bin"
    );

    private static final Pattern ARTIFACT_ID_PATTERN =
            Pattern.compile("<artifactId>\\s*([^<\\s]+)\\s*</artifactId>");
    private static final Pattern PARENT_BLOCK_PATTERN =
            Pattern.compile("(?s)<parent>.*?</parent>");

    private ProjectInfoUtils() {
    }

    public static int countJavaFiles(Path root) throws IOException {
        final int[] count = {0};
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                if (!dir.equals(root) && shouldExclude(dir)) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (file.getFileName().toString().endsWith(".java")) {
                    count[0]++;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });
        return count[0];
    }

    public static Optional<Path> findClosestPom(Path root) throws IOException {
        try (Stream<Path> stream = Files.walk(root)) {
            return stream
                    .filter(Files::isRegularFile)
                    .filter(p -> "pom.xml".equals(p.getFileName().toString()))
                    .filter(p -> !isUnderExcludedDir(root, p))
                    .min(Comparator.comparingInt(Path::getNameCount));
        }
    }

    public static String deriveName(Path root, Path pomPath) {
        if (pomPath != null) {
            Optional<String> artifactId = extractArtifactId(pomPath);
            if (artifactId.isPresent()) {
                return artifactId.get();
            }
        }
        Path name = root.getFileName();
        return name != null ? name.toString() : root.toString();
    }

    public static Optional<String> extractArtifactId(Path pomPath) {
        try {
            String content = Files.readString(pomPath);
            String cleaned = PARENT_BLOCK_PATTERN.matcher(content).replaceAll("");
            Matcher m = ARTIFACT_ID_PATTERN.matcher(cleaned);
            if (m.find()) {
                return Optional.of(m.group(1).trim());
            }
        } catch (IOException ignored) {
            // fall through
        }
        return Optional.empty();
    }

    public static boolean shouldExclude(Path dir) {
        Path name = dir.getFileName();
        return name != null && EXCLUDED_DIRS.contains(name.toString());
    }

    private static boolean isUnderExcludedDir(Path root, Path file) {
        Path rel;
        try {
            rel = root.relativize(file);
        } catch (IllegalArgumentException e) {
            return false;
        }
        for (Path part : rel) {
            if (EXCLUDED_DIRS.contains(part.toString())) {
                return true;
            }
        }
        return false;
    }
}
