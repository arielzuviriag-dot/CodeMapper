package com.codemapper.parser;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Scans a React Native (or any TS/JS) project for HTTP calls through a
 * centralized client — {@code apiAuth.post('/appointments', ...)},
 * {@code apiPublic.get(`/x/${id}`)}, {@code axios.put('/y')} — and figures out:
 *
 * <ul>
 *   <li>each call's HTTP verb + normalized path,</li>
 *   <li>the exported wrapper function the call lives in (the "action"),</li>
 *   <li>which screen files reference that wrapper.</li>
 * </ul>
 *
 * Pure regex/text — no TS parser. Deterministic; tolerant of dynamic paths by
 * normalizing {@code ${...}} / {@code {x}} segments to {@code {}} so they can
 * match Spring's {@code @GetMapping("/x/{id}")}.
 */
@Slf4j
@Component
public class MobileEndpointScanner {

    private static final Set<String> EXCLUDED = Set.of(
            "node_modules", ".expo", ".git", "dist", "build", "android", "ios", ".next");

    private static final long MAX_FILE_BYTES = 600_000;

    /** {@code something.post<Type>('/path'} or with backtick/double quotes. */
    private static final Pattern API_CALL = Pattern.compile(
            "\\b[A-Za-z_$][\\w$]*\\.(get|post|put|patch|delete)\\s*(?:<[^>]*>)?\\s*\\(\\s*[`'\"]([^`'\"]+)[`'\"]");
    /** {@code fetch('/x')} / {@code axios('/x')} — verb unknown (wildcard). */
    private static final Pattern FETCH_CALL = Pattern.compile(
            "\\b(?:fetch|axios)\\s*\\(\\s*[`'\"]([^`'\"]+)[`'\"]");
    /** jQuery {@code $.get('/x')} / {@code $.post('/x')} (old front). */
    private static final Pattern JQUERY_CALL = Pattern.compile(
            "\\$\\.(get|post)\\s*\\(\\s*[`'\"]([^`'\"]+)[`'\"]");
    /** {@code XMLHttpRequest.open('GET','/x')} (classic AJAX). */
    private static final Pattern XHR_CALL = Pattern.compile(
            "\\.open\\s*\\(\\s*[`'\"]([A-Za-z]+)[`'\"]\\s*,\\s*[`'\"]([^`'\"]+)[`'\"]");
    /** Old HTML form: {@code action="/x"} — verb unknown (wildcard). */
    private static final Pattern FORM_ACTION = Pattern.compile(
            "action\\s*=\\s*[`'\"]([^`'\"]+)[`'\"]");

    // Only EXPORTED top-level declarations are candidates for "the action" — a
    // local `const res = await api.post(...)` must NOT win over the exported
    // wrapper (e.g. `export async function createAppointment`).
    private static final Pattern FN_DECL = Pattern.compile(
            "export\\s+(?:async\\s+)?function\\s+([A-Za-z_$][\\w$]*)");
    private static final Pattern CONST_DECL = Pattern.compile(
            "export\\s+const\\s+([A-Za-z_$][\\w$]*)\\s*=");

    public record RnApiCall(String verb, String path, String functionName, String file) {}

    /**
     * @param apiCalls           every HTTP call found (verb+path+fn+file).
     * @param screensByFunction  wrapper fn → screen files that reference it.
     * @param screenFiles        ALL page/screen-like files found (web mode) —
     *                           so the linker can show every screen, even ones
     *                           with no detected call.
     */
    public record ScanResult(List<RnApiCall> apiCalls,
                             Map<String, List<String>> screensByFunction,
                             List<String> screenFiles) {}

    /** Narrow (React-Native) screen detection — back-compat for the exception
     *  / mobile-origins path. */
    public ScanResult scan(Path root) {
        return scan(root, false);
    }

    /**
     * @param webMode when true, also treat web screen dirs ({@code /pages/},
     *                {@code /views/}, {@code /routes/}) and UI {@code .tsx/.jsx}
     *                files as "screens" — a web admin doesn't use the RN
     *                {@code /app/}|{@code /screens/} convention.
     */
    public ScanResult scan(Path root, boolean webMode) {
        List<RnApiCall> calls = new ArrayList<>();
        List<Path> files = new ArrayList<>();
        try {
            files = collectSourceFiles(root);
        } catch (IOException e) {
            log.warn("Mobile scan: could not walk {}: {}", root, e.getMessage());
            return new ScanResult(calls, Map.of(), List.of());
        }

        Map<String, String> fileText = new LinkedHashMap<>();
        for (Path f : files) {
            try {
                if (Files.size(f) > MAX_FILE_BYTES) continue;
                fileText.put(f.toString(), Files.readString(f));
            } catch (Exception ignored) {
                // unreadable / non-UTF8 — skip
            }
        }

        for (var entry : fileText.entrySet()) {
            String file = entry.getKey();
            String text = entry.getValue();
            List<String> declNames = new ArrayList<>();
            List<Integer> declIdx = new ArrayList<>();
            collectDecls(text, declIdx, declNames);

            // The modern wrapper-client pattern (api.get/post(...)).
            collectCalls(API_CALL, 1, 2, text, file, declIdx, declNames, calls);
            // Any-front patterns — fetch/axios/jQuery/XHR/old HTML forms — so we
            // catch old and new front-ends, not just a centralized TS client.
            if (webMode) {
                collectCalls(JQUERY_CALL, 1, 2, text, file, declIdx, declNames, calls);
                collectCalls(XHR_CALL, 1, 2, text, file, declIdx, declNames, calls);
                collectCalls(FETCH_CALL, 0, 1, text, file, declIdx, declNames, calls);
                collectCalls(FORM_ACTION, 0, 1, text, file, declIdx, declNames, calls);
            }
        }

        // For every wrapper function found in an api call, find which OTHER
        // files (screens) reference it by name.
        Map<String, List<String>> screensByFn = new HashMap<>();
        for (RnApiCall c : calls) {
            if (screensByFn.containsKey(c.functionName())) continue;
            List<String> screens = new ArrayList<>();
            Pattern use = Pattern.compile("\\b" + Pattern.quote(c.functionName()) + "\\b");
            for (var entry : fileText.entrySet()) {
                String file = entry.getKey();
                if (file.equals(c.file())) continue; // skip the defining module
                if (!isScreenFile(file, webMode)) continue;
                if (use.matcher(entry.getValue()).find()) {
                    screens.add(file);
                }
            }
            screensByFn.put(c.functionName(), screens);
        }

        // Every page/screen-like file — so the linker can draw the FULL front
        // surface, not only the screens that happen to call the backend.
        List<String> screenFiles = new ArrayList<>();
        if (webMode) {
            for (String file : fileText.keySet()) {
                if (isPageFile(file)) screenFiles.add(file);
            }
        }

        log.info("Mobile scan of {}: {} api calls, {} wrapper functions, {} screen files",
                root, calls.size(), screensByFn.size(), screenFiles.size());
        return new ScanResult(calls, screensByFn, screenFiles);
    }

    /** Run one call-pattern over a file, attributing each hit to its enclosing
     *  exported function. verbGroup 0 = "no verb" (wildcard match by path). */
    private void collectCalls(Pattern pattern, int verbGroup, int pathGroup,
                              String text, String file, List<Integer> declIdx,
                              List<String> declNames, List<RnApiCall> out) {
        Matcher m = pattern.matcher(text);
        while (m.find()) {
            String verb = verbGroup > 0 ? m.group(verbGroup).toUpperCase() : "";
            String path = normalizePath(m.group(pathGroup));
            if (path == null) continue;
            String fn = enclosingFunction(declIdx, declNames, m.start(), file);
            out.add(new RnApiCall(verb, path, fn, file));
        }
    }

    /** A page/screen-level file: any HTML/Vue/Svelte file, or a file under a
     *  conventional screen dir. Deliberately NOT every component — that would
     *  flood the graph with buttons/utilities. */
    private boolean isPageFile(String file) {
        String n = file.replace('\\', '/').toLowerCase();
        if (n.endsWith(".html") || n.endsWith(".htm")
                || n.endsWith(".vue") || n.endsWith(".svelte")) {
            return true;
        }
        return n.contains("/pages/") || n.contains("/views/") || n.contains("/screens/")
                || n.contains("/routes/") || n.contains("/app/") || n.contains("/templates/");
    }

    /** A "screen" lives under app/ or screens/ — the expo-router / RN UI dirs.
     *  In web mode, also count pages/views/routes dirs and UI .tsx/.jsx files
     *  (excluding api/client/lib/hooks/utils/services modules). */
    private boolean isScreenFile(String file, boolean webMode) {
        String n = file.replace('\\', '/').toLowerCase();
        if (n.contains("/app/") || n.contains("/screens/")) return true;
        if (!webMode) return false;
        if (n.contains("/pages/") || n.contains("/views/") || n.contains("/routes/")) {
            return true;
        }
        if (n.endsWith(".tsx") || n.endsWith(".jsx")) {
            return !(n.contains("/api/") || n.contains("/client") || n.contains("/lib/")
                    || n.contains("/hooks/") || n.contains("/utils/")
                    || n.contains("/services/"));
        }
        return false;
    }

    /** Normalize a raw path so it can match a Spring mapping. Strips the query
     *  string and collapses {@code ${...}} / {@code {x}} to {@code {}}. Returns
     *  null for non-path strings (no leading slash and not relative-ish). */
    public static String normalizePath(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String p = raw.trim();
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        // template + path-var placeholders → {}
        p = p.replaceAll("\\$\\{[^}]*\\}", "{}");
        p = p.replaceAll("\\{[^}]*\\}", "{}");
        if (!p.startsWith("/")) {
            // ignore absolute URLs (http...) and odd strings
            if (p.startsWith("http")) {
                int slash = p.indexOf('/', p.indexOf("//") + 2);
                if (slash < 0) return null;
                p = p.substring(slash);
            } else {
                return null;
            }
        }
        if (p.length() > 1 && p.endsWith("/")) p = p.substring(0, p.length() - 1);
        return p;
    }

    private void collectDecls(String text, List<Integer> idx, List<String> names) {
        Matcher fn = FN_DECL.matcher(text);
        while (fn.find()) {
            idx.add(fn.start());
            names.add(fn.group(1));
        }
        Matcher c = CONST_DECL.matcher(text);
        while (c.find()) {
            idx.add(c.start());
            names.add(c.group(1));
        }
    }

    private String enclosingFunction(List<Integer> declIdx, List<String> declNames,
                                     int callStart, String file) {
        int best = -1;
        String name = null;
        for (int i = 0; i < declIdx.size(); i++) {
            int di = declIdx.get(i);
            if (di <= callStart && di > best) {
                best = di;
                name = declNames.get(i);
            }
        }
        if (name != null) return name;
        // fallback: file base name without extension
        String f = file.replace('\\', '/');
        String base = f.substring(f.lastIndexOf('/') + 1);
        int dot = base.indexOf('.');
        return dot > 0 ? base.substring(0, dot) : base;
    }

    private List<Path> collectSourceFiles(Path root) throws IOException {
        List<Path> files = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                Path name = dir.getFileName();
                if (!dir.equals(root) && name != null && EXCLUDED.contains(name.toString())) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                String n = file.getFileName().toString().toLowerCase();
                if (n.endsWith(".ts") || n.endsWith(".tsx") || n.endsWith(".js")
                        || n.endsWith(".jsx") || n.endsWith(".html") || n.endsWith(".htm")
                        || n.endsWith(".vue") || n.endsWith(".svelte")) {
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
