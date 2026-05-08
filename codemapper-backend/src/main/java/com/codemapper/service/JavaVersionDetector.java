package com.codemapper.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects the major Java version targeted by a project, by scraping its build
 * manifest. Used internally to (a) configure the parser's LanguageLevel so
 * features like records/sealed compile cleanly, and (b) drive the per-feature
 * compatibility rules documented in PLAN_FOCO_DIMENSIONES.md.
 *
 * Returns a normalized major-version string ("8", "11", "17", "21") or null
 * when no manifest is found. "1.8" is normalized to "8".
 */
@Slf4j
@Service
public class JavaVersionDetector {

    private static final List<Pattern> POM_PATTERNS = List.of(
            Pattern.compile("<maven\\.compiler\\.release>\\s*([^<\\s]+)\\s*</maven\\.compiler\\.release>"),
            Pattern.compile("<java\\.version>\\s*([^<\\s]+)\\s*</java\\.version>"),
            Pattern.compile("<maven\\.compiler\\.source>\\s*([^<\\s]+)\\s*</maven\\.compiler\\.source>"),
            Pattern.compile("<release>\\s*([^<\\s]+)\\s*</release>"),
            Pattern.compile("<source>\\s*([^<\\s]+)\\s*</source>")
    );

    private static final List<Pattern> GRADLE_PATTERNS = List.of(
            Pattern.compile("languageVersion\\s*=\\s*JavaLanguageVersion\\.of\\(\\s*(\\d+)\\s*\\)"),
            Pattern.compile("JavaLanguageVersion\\.of\\(\\s*(\\d+)\\s*\\)"),
            Pattern.compile("sourceCompatibility\\s*=\\s*JavaVersion\\.VERSION_(\\d+)"),
            Pattern.compile("sourceCompatibility\\s*[=:]\\s*['\"]?(\\d+(?:\\.\\d+)?)['\"]?"),
            Pattern.compile("targetCompatibility\\s*=\\s*JavaVersion\\.VERSION_(\\d+)"),
            Pattern.compile("targetCompatibility\\s*[=:]\\s*['\"]?(\\d+(?:\\.\\d+)?)['\"]?")
    );

    public String detect(Path projectRoot) {
        if (projectRoot == null) {
            log.debug("JavaVersionDetector called with null projectRoot");
            return null;
        }

        Path pom = projectRoot.resolve("pom.xml");
        if (Files.isRegularFile(pom)) {
            Optional<String> v = readAndMatch(pom, POM_PATTERNS);
            if (v.isPresent()) {
                String normalized = normalize(v.get());
                log.info("Java version detected from pom.xml: {} (raw: {})", normalized, v.get());
                return normalized;
            }
        }

        for (String name : List.of("build.gradle", "build.gradle.kts")) {
            Path gradle = projectRoot.resolve(name);
            if (Files.isRegularFile(gradle)) {
                Optional<String> v = readAndMatch(gradle, GRADLE_PATTERNS);
                if (v.isPresent()) {
                    String normalized = normalize(v.get());
                    log.info("Java version detected from {}: {} (raw: {})", name, normalized, v.get());
                    return normalized;
                }
            }
        }

        log.info("Java version: null (no pom.xml/build.gradle parseable, falling back to BLEEDING_EDGE)");
        return null;
    }

    private Optional<String> readAndMatch(Path file, List<Pattern> patterns) {
        try {
            String content = Files.readString(file);
            for (Pattern p : patterns) {
                Matcher m = p.matcher(content);
                if (m.find()) {
                    return Optional.of(m.group(1).trim());
                }
            }
        } catch (IOException e) {
            log.debug("Could not read {}: {}", file, e.getMessage());
        }
        return Optional.empty();
    }

    /** Strip the leading "1." that legacy versions used (1.8 → 8). */
    private String normalize(String raw) {
        String s = raw.trim();
        if (s.startsWith("1.")) {
            return s.substring(2);
        }
        return s;
    }
}
