package com.codemapper.parser;

import com.codemapper.model.dto.ExceptionCauseDto;
import com.codemapper.model.dto.ExceptionFrameDto;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure parser: raw Java stack-trace text → an ordered list of
 * {@link ExceptionCauseDto} (the causal chain). Deterministic, no project
 * knowledge — {@code userCode}/{@code classId} on each frame stay unset here
 * and are filled later by the tracer service.
 *
 * <p>Deliberately TOLERANT of messy input: log timestamps/levels before the
 * {@code at}, the {@code ... N more} elision lines, {@code Suppressed:}
 * blocks, native/unknown-source frames, lambda synthetic methods and nested
 * {@code Outer$Inner} declaring classes. Anything it can't classify is simply
 * ignored rather than throwing.</p>
 */
@Component
public class ExceptionTraceParser {

    /** {@code at com.foo.Bar.method(Bar.java:42)} — searched anywhere on the
     *  line so a leading log prefix doesn't defeat it. Tolerates the JPMS
     *  {@code module/package.Class} form (e.g. {@code java.base/java.lang.Thread}). */
    private static final Pattern FRAME = Pattern.compile(
            "\\bat\\s+(?:[\\w.$]+/)?([\\w.$]+)\\.([\\w$<>]+)\\s*\\(([^)]*)\\)");

    /** {@code Caused by: com.foo.BarException: message} */
    private static final Pattern CAUSED_BY = Pattern.compile(
            "Caused by:\\s*([^\\s:]+)(?::\\s?(.*))?$");

    /** {@code Suppressed: com.foo.BarException: message} — treated like a cause. */
    private static final Pattern SUPPRESSED = Pattern.compile(
            "Suppressed:\\s*([^\\s:]+)(?::\\s?(.*))?$");

    /** A bare exception header line (the first line of a trace), tolerant of a
     *  leading {@code Exception in thread "x"} or a log prefix. */
    private static final Pattern HEADER = Pattern.compile(
            "([\\w.$]*(?:Exception|Error|Throwable)[\\w$]*)(?::\\s?(.*))?$");

    /** {@code SomeFile.java:123} inside the frame's parenthesised location. */
    private static final Pattern LOCATION = Pattern.compile(
            "([\\w$]+\\.java)(?::(\\d+))?");

    public List<ExceptionCauseDto> parse(String raw) {
        List<ExceptionCauseDto> causes = new ArrayList<>();
        if (raw == null || raw.isBlank()) {
            return causes;
        }

        ExceptionCauseDto current = null;
        for (String rawLine : raw.split("\\r?\\n")) {
            String line = rawLine.strip();
            if (line.isEmpty()) continue;

            // "... 23 more" elision — nothing to add.
            if (line.startsWith("...")) continue;

            Matcher causedBy = CAUSED_BY.matcher(line);
            Matcher suppressed = SUPPRESSED.matcher(line);
            Matcher frame = FRAME.matcher(line);

            if (causedBy.find()) {
                current = new ExceptionCauseDto(
                        causedBy.group(1),
                        nullToEmpty(causedBy.group(2)),
                        new ArrayList<>());
                causes.add(current);
            } else if (suppressed.find()) {
                current = new ExceptionCauseDto(
                        suppressed.group(1),
                        nullToEmpty(suppressed.group(2)),
                        new ArrayList<>());
                causes.add(current);
            } else if (frame.find()) {
                if (current == null) {
                    // Frames before any recognised header — open an anonymous
                    // section so we don't drop them.
                    current = new ExceptionCauseDto("(desconocida)", "", new ArrayList<>());
                    causes.add(current);
                }
                current.getFrames().add(toFrame(frame));
            } else {
                // Not a frame, not a caused-by → maybe the top header line.
                Matcher header = HEADER.matcher(line);
                if (current == null && header.find() && !header.group(1).isEmpty()) {
                    current = new ExceptionCauseDto(
                            header.group(1),
                            nullToEmpty(header.group(2)),
                            new ArrayList<>());
                    causes.add(current);
                }
                // else: free text we can't classify — ignore.
            }
        }
        return causes;
    }

    private ExceptionFrameDto toFrame(Matcher frame) {
        String declaringClass = frame.group(1);
        String method = frame.group(2);
        String location = frame.group(3);

        String fileName = null;
        int lineNumber = 0;
        Matcher loc = LOCATION.matcher(location == null ? "" : location);
        if (loc.find()) {
            fileName = loc.group(1);
            if (loc.group(2) != null) {
                try {
                    lineNumber = Integer.parseInt(loc.group(2));
                } catch (NumberFormatException ignored) {
                    lineNumber = 0;
                }
            }
        }

        String topLevel = topLevelFqn(declaringClass);
        return new ExceptionFrameDto(
                declaringClass,
                topLevel,
                simpleName(topLevel),
                method,
                fileName,
                lineNumber,
                false,
                null);
    }

    /** Strip the {@code $Inner} suffix so nested classes match their top-level
     *  declaring file/FQN. {@code com.foo.Outer$Inner} → {@code com.foo.Outer}. */
    static String topLevelFqn(String declaringClass) {
        if (declaringClass == null) return "";
        int dollar = declaringClass.indexOf('$');
        return dollar >= 0 ? declaringClass.substring(0, dollar) : declaringClass;
    }

    static String simpleName(String fqn) {
        if (fqn == null || fqn.isEmpty()) return "";
        int dot = fqn.lastIndexOf('.');
        return dot >= 0 ? fqn.substring(dot + 1) : fqn;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s.strip();
    }
}
