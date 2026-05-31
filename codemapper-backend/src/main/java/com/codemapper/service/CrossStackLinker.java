package com.codemapper.service;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.ConnectionType;
import com.codemapper.model.domain.ParsedClass;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.ClassFoundEvent;
import com.codemapper.model.event.ConnectionFoundEvent;
import com.codemapper.parser.MobileEndpointScanner;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.ArrayInitializerExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * "Aplicación" cross-stack linker — connects the front-end to the backend.
 *
 * <p>Scans a web / React-Native project for HTTP calls (via
 * {@link MobileEndpointScanner}), matches each call's verb+path to a Spring
 * {@code @GetMapping}/etc. on a parsed controller, and streams:
 * <ul>
 *   <li>a {@link ClassType#WEB_SCREEN} node per front-end screen that calls the
 *       backend (so the web layer is visible and distinguishable from Java),</li>
 *   <li>an {@link ConnectionType#HTTP_CALL} edge screen → controller for each
 *       resolved call.</li>
 * </ul>
 *
 * <p>Screens whose call matches no controller are <b>still emitted</b> (orphan
 * nodes, no edge) so the user sees the screen exists even when we can't tell
 * where it goes. Pure regex/AST, no symbol resolution — deterministic and cheap.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CrossStackLinker {

    private final MobileEndpointScanner scanner;

    /** dir → "is React-Native?" memo, so we read each package.json once. */
    private final Map<String, Boolean> mobileDirCache = new java.util.concurrent.ConcurrentHashMap<>();

    /** A Spring mapping (verb + normalized path). */
    private record Endpoint(String verb, String path) {}
    /** A controller endpoint tagged with the node id of its controller class. */
    private record ControllerEndpoint(String verb, String path, String controllerId) {}

    /** A front-end screen that calls an endpoint — used by the live "Escuchar"
     *  mode to show which screen triggered a request. */
    public record ScreenCall(String verb, String path, String screenName,
                             String screenFile, boolean mobile) {}

    /** Safety cap so a huge front-end can't flood the graph. */
    private static final int MAX_WEB_NODES = 200;

    /**
     * Scan {@code frontendPath}, link screens → controllers, and push the
     * resulting WEB_SCREEN nodes + HTTP_CALL edges through {@code sink}. No-op
     * when there's no front-end path or it isn't a directory.
     */
    public void streamWebLinks(List<ParsedClass> classes, String projectRoot,
                               String frontendPath, String frontendKind,
                               Consumer<BaseEvent> sink) {
        if (frontendPath == null || frontendPath.isBlank()) return;
        Path root = Path.of(frontendPath);
        if (!Files.isDirectory(root)) {
            log.warn("Cross-stack: front-end path is not a directory: {}", frontendPath);
            return;
        }

        // Auto-detect web vs React Native from package.json so the user never
        // has to pick. An explicit frontendKind (if ever passed) still wins.
        boolean webMode;
        if ("react-native".equalsIgnoreCase(frontendKind)) {
            webMode = false;
        } else if ("web".equalsIgnoreCase(frontendKind)) {
            webMode = true;
        } else {
            webMode = !isReactNative(root);
        }
        log.info("Cross-stack: {} detected as {}", frontendPath, webMode ? "web" : "react-native");
        MobileEndpointScanner.ScanResult scan = scanner.scan(root, webMode);
        if (scan.apiCalls().isEmpty()) {
            log.info("Cross-stack: no HTTP calls found under {}", frontendPath);
            return;
        }

        // Endpoint table from BOTH sources: Spring annotations (@GetMapping…)
        // and Struts/XML config (struts.xml / struts-config.xml → Action class).
        List<ControllerEndpoint> endpoints = collectControllerEndpoints(classes);
        endpoints.addAll(collectStrutsEndpoints(projectRoot, classes));

        Set<String> emittedNodes = new HashSet<>();
        Set<String> emittedEdges = new HashSet<>();

        for (MobileEndpointScanner.RnApiCall call : scan.apiCalls()) {
            // Screens that use this call's wrapper fn; fall back to the file the
            // call lives in when no screen references it.
            List<String> screens = scan.screensByFunction()
                    .getOrDefault(call.functionName(), List.of());
            List<String> screenFiles = screens.isEmpty() ? List.of(call.file()) : screens;

            // The controller this call hits (first matching endpoint), or null.
            String controllerId = null;
            for (ControllerEndpoint ep : endpoints) {
                if (verbMatches(ep.verb(), call.verb()) && pathsMatch(ep.path(), call.path())) {
                    controllerId = ep.controllerId();
                    break;
                }
            }

            for (String screenFile : screenFiles) {
                String screenId = "web:" + screenFile.replace('\\', '/');
                if (!emittedNodes.contains(screenId)) {
                    if (emittedNodes.size() >= MAX_WEB_NODES) {
                        log.info("Cross-stack: reached MAX_WEB_NODES cap ({})", MAX_WEB_NODES);
                        break;
                    }
                    emittedNodes.add(screenId);
                    sink.accept(webNode(screenId, screenFile, root));
                }
                if (controllerId != null) {
                    String edgeKey = screenId + "->" + controllerId;
                    if (emittedEdges.add(edgeKey)) {
                        String label = (call.verb() == null || call.verb().isBlank())
                                ? call.path() : call.verb() + " " + call.path();
                        sink.accept(new ConnectionFoundEvent(screenId, controllerId,
                                ConnectionType.HTTP_CALL, label));
                    }
                }
            }
            if (emittedNodes.size() >= MAX_WEB_NODES) break;
        }

        // Draw EVERY page/screen the scan found — even ones with no detected
        // backend call — so the front surface is complete (orphan nodes).
        for (String screenFile : scan.screenFiles()) {
            if (emittedNodes.size() >= MAX_WEB_NODES) {
                log.info("Cross-stack: reached MAX_WEB_NODES cap ({})", MAX_WEB_NODES);
                break;
            }
            String screenId = "web:" + screenFile.replace('\\', '/');
            if (emittedNodes.add(screenId)) {
                sink.accept(webNode(screenId, screenFile, root));
            }
        }

        log.info("Cross-stack link of {}: {} web node(s), {} edge(s)",
                frontendPath, emittedNodes.size(), emittedEdges.size());
    }

    /**
     * Scan a front-end project for screens that call the backend — returns each
     * (verb, path, screen, mobile?) so the live "Escuchar" mode can match a
     * runtime request to the screen that triggered it. React/RN today; native
     * Android/iOS would be future adapters.
     */
    public List<ScreenCall> scanScreens(String frontendPath) {
        List<ScreenCall> out = new ArrayList<>();
        if (frontendPath == null || frontendPath.isBlank()) return out;
        Path root = Path.of(frontendPath);
        if (!Files.isDirectory(root)) {
            log.warn("Frontend scan: not a directory: {}", frontendPath);
            return out;
        }
        // Broad scan so we catch web pages, RN screens and old HTML alike.
        MobileEndpointScanner.ScanResult scan = scanner.scan(root, true);
        Set<String> seen = new HashSet<>();
        for (MobileEndpointScanner.RnApiCall call : scan.apiCalls()) {
            List<String> screens = scan.screensByFunction()
                    .getOrDefault(call.functionName(), List.of());
            List<String> files = screens.isEmpty() ? List.of(call.file()) : screens;
            for (String f : files) {
                String key = call.verb() + "|" + call.path() + "|" + f;
                if (!seen.add(key)) continue;
                out.add(new ScreenCall(call.verb(), call.path(), baseName(f), f, isMobileFile(f)));
            }
        }
        log.info("Frontend screen scan of {}: {} screen call(s)", frontendPath, out.size());
        return out;
    }

    private ClassFoundEvent webNode(String id, String screenFile, Path frontendRoot) {
        String rel = relativize(frontendRoot, screenFile);
        ClassFoundEvent e = new ClassFoundEvent();
        e.setId(id);
        e.setName(baseName(screenFile));
        e.setFullyQualifiedName(rel);
        e.setPackageName(parentDir(rel));
        e.setType(isMobileFile(screenFile) ? ClassType.MOBILE_SCREEN : ClassType.WEB_SCREEN);
        e.setAnnotations(List.of());
        e.setFilePath(screenFile);
        e.setLineCount(0);
        e.setModifiers(List.of());
        return e;
    }

    // ── Controller endpoint extraction ──────────────────────────────────

    private List<ControllerEndpoint> collectControllerEndpoints(List<ParsedClass> classes) {
        List<ControllerEndpoint> out = new ArrayList<>();
        if (classes == null) return out;
        for (ParsedClass pc : classes) {
            if (!looksLikeController(pc) || pc.getFilePath() == null) continue;
            try {
                CompilationUnit cu = StaticJavaParser.parse(Path.of(pc.getFilePath()).toFile());
                for (TypeDeclaration<?> type : cu.getTypes()) {
                    for (Endpoint ep : extractMappings(type).values()) {
                        if (ep.path() != null) {
                            out.add(new ControllerEndpoint(ep.verb(), ep.path(), pc.getId()));
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("Cross-stack: could not parse controller {}: {}",
                        pc.getFilePath(), e.getMessage());
            }
        }
        return out;
    }

    /** A screen is "mobile" when the nearest package.json up its tree depends
     *  on react-native/expo. Lets a monorepo with web + mobile fronts tag each
     *  screen correctly. Cached per directory. */
    private boolean isMobileFile(String screenFile) {
        Path start = Path.of(screenFile).getParent();
        if (start == null) return false;
        return mobileDirCache.computeIfAbsent(start.toString(), k -> {
            Path dir = start;
            while (dir != null) {
                Path pkg = dir.resolve("package.json");
                if (Files.isRegularFile(pkg)) {
                    try {
                        String t = Files.readString(pkg);
                        return t.contains("\"react-native\"") || t.contains("\"expo\"");
                    } catch (Exception e) {
                        return false;
                    }
                }
                dir = dir.getParent();
            }
            return false;
        });
    }

    /** A front-end is React Native when its package.json depends on
     *  react-native or expo. Defaults to false (web) when unsure — the web
     *  screen heuristic is a superset, so it degrades gracefully. */
    private boolean isReactNative(Path root) {
        Path pkg = root.resolve("package.json");
        try {
            if (Files.isRegularFile(pkg)) {
                String text = Files.readString(pkg);
                return text.contains("\"react-native\"") || text.contains("\"expo\"");
            }
        } catch (Exception ignored) {
            // unreadable package.json — fall through to web default
        }
        return false;
    }

    private boolean looksLikeController(ParsedClass pc) {
        if (pc.getAnnotations() == null) return false;
        for (String a : pc.getAnnotations()) {
            String s = a.replace("@", "");
            if (s.startsWith("RestController") || s.startsWith("Controller")
                    || s.startsWith("RequestMapping")) {
                return true;
            }
        }
        return false;
    }

    // ── Struts / XML config endpoints ───────────────────────────────────

    private static final Set<String> XML_EXCLUDED =
            Set.of("node_modules", ".git", "target", "build", "dist", ".idea");

    /**
     * Parse {@code struts.xml} / {@code struts-config.xml} under the project
     * root and map each action's URL → its Action class node. Verb is "" —
     * Struts doesn't gate by HTTP method — so a JSP form/link matches by path.
     * Supports Struts 2 ({@code <action name= class=>} inside a
     * {@code <package namespace=>}) and Struts 1 ({@code <action path= type=>}).
     */
    private List<ControllerEndpoint> collectStrutsEndpoints(String projectRoot,
                                                            List<ParsedClass> classes) {
        List<ControllerEndpoint> out = new ArrayList<>();
        if (projectRoot == null || projectRoot.isBlank()) return out;
        Path root = Path.of(projectRoot);
        if (!Files.isDirectory(root)) return out;

        Map<String, String> idByFqn = new HashMap<>();
        for (ParsedClass pc : classes) {
            if (pc.getFullyQualifiedName() != null) {
                idByFqn.put(pc.getFullyQualifiedName(), pc.getId());
            }
        }

        for (Path xml : findStrutsXml(root)) {
            try {
                Document doc = parseXmlNoDtd(xml);
                NodeList actions = doc.getElementsByTagName("action");
                for (int i = 0; i < actions.getLength(); i++) {
                    if (!(actions.item(i) instanceof Element a)) continue;
                    String cls = a.getAttribute("class");  // Struts 2
                    String type = a.getAttribute("type");  // Struts 1
                    String fqn = !cls.isBlank() ? cls : type;
                    if (fqn.isBlank()) continue;
                    String id = idByFqn.get(fqn);
                    if (id == null) continue; // Action class not in parsed project
                    String rawPath = !cls.isBlank()
                            ? joinPaths(parentNamespace(a), a.getAttribute("name")) // Struts 2
                            : a.getAttribute("path");                               // Struts 1
                    String path = MobileEndpointScanner.normalizePath(rawPath);
                    if (path != null) out.add(new ControllerEndpoint("", path, id));
                }
            } catch (Exception e) {
                log.debug("Cross-stack: could not parse {}: {}", xml, e.getMessage());
            }
        }
        if (!out.isEmpty()) {
            log.info("Cross-stack: {} Struts action endpoint(s) from XML", out.size());
        }
        return out;
    }

    /** Namespace of the action's enclosing {@code <package>} (Struts 2), or "". */
    private String parentNamespace(Element action) {
        org.w3c.dom.Node n = action.getParentNode();
        while (n instanceof Element e) {
            if ("package".equals(e.getTagName())) return e.getAttribute("namespace");
            n = e.getParentNode();
        }
        return "";
    }

    private List<Path> findStrutsXml(Path root) {
        List<Path> out = new ArrayList<>();
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    Path name = dir.getFileName();
                    if (!dir.equals(root) && name != null
                            && XML_EXCLUDED.contains(name.toString())) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    String n = file.getFileName().toString().toLowerCase();
                    if (n.equals("struts.xml") || n.equals("struts-config.xml")) {
                        out.add(file);
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.debug("Cross-stack: struts xml walk failed under {}: {}", root, e.getMessage());
        }
        return out;
    }

    /** Parse XML without fetching the Struts DTD (offline + closes XXE). */
    private Document parseXmlNoDtd(Path xml) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        f.setFeature("http://xml.org/sax/features/external-general-entities", false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        f.setValidating(false);
        DocumentBuilder b = f.newDocumentBuilder();
        return b.parse(xml.toFile());
    }

    private Map<String, Endpoint> extractMappings(TypeDeclaration<?> type) {
        Map<String, Endpoint> out = new LinkedHashMap<>();
        String prefix = "";
        for (AnnotationExpr ann : type.getAnnotations()) {
            if ("RequestMapping".equals(ann.getNameAsString())) {
                prefix = annPath(ann);
                break;
            }
        }
        for (MethodDeclaration md : type.getMethods()) {
            Endpoint ep = endpointFor(md, prefix);
            if (ep != null && ep.path() != null) {
                out.put(md.getNameAsString(), ep);
            }
        }
        return out;
    }

    private Endpoint endpointFor(MethodDeclaration md, String classPrefix) {
        for (AnnotationExpr ann : md.getAnnotations()) {
            String n = ann.getNameAsString();
            String verb = switch (n) {
                case "GetMapping" -> "GET";
                case "PostMapping" -> "POST";
                case "PutMapping" -> "PUT";
                case "PatchMapping" -> "PATCH";
                case "DeleteMapping" -> "DELETE";
                case "RequestMapping" -> requestMappingVerb(ann);
                default -> null;
            };
            if (verb == null) continue;
            String full = joinPaths(classPrefix, annPath(ann));
            return new Endpoint(verb, MobileEndpointScanner.normalizePath(full));
        }
        return null;
    }

    private String annPath(AnnotationExpr ann) {
        if (ann instanceof SingleMemberAnnotationExpr sma) {
            return literalOf(sma.getMemberValue());
        }
        if (ann instanceof NormalAnnotationExpr na) {
            for (var pair : na.getPairs()) {
                String name = pair.getNameAsString();
                if ("value".equals(name) || "path".equals(name)) {
                    return literalOf(pair.getValue());
                }
            }
        }
        return "";
    }

    private String requestMappingVerb(AnnotationExpr ann) {
        if (ann instanceof NormalAnnotationExpr na) {
            for (var pair : na.getPairs()) {
                if ("method".equals(pair.getNameAsString())) {
                    String v = pair.getValue().toString();
                    int dot = v.lastIndexOf('.');
                    return (dot >= 0 ? v.substring(dot + 1) : v).replaceAll("[^A-Za-z]", "");
                }
            }
        }
        return "";
    }

    private String literalOf(Expression expr) {
        if (expr instanceof StringLiteralExpr s) return s.getValue();
        if (expr instanceof ArrayInitializerExpr arr) {
            for (Expression e : arr.getValues()) {
                if (e instanceof StringLiteralExpr s) return s.getValue();
            }
        }
        return "";
    }

    private String joinPaths(String prefix, String path) {
        String a = trimSlashes(prefix);
        String b = trimSlashes(path);
        StringBuilder sb = new StringBuilder("/");
        if (!a.isEmpty()) sb.append(a);
        if (!b.isEmpty()) {
            if (sb.charAt(sb.length() - 1) != '/') sb.append('/');
            sb.append(b);
        }
        return sb.toString();
    }

    private String trimSlashes(String s) {
        if (s == null) return "";
        String t = s.trim();
        while (t.startsWith("/")) t = t.substring(1);
        while (t.endsWith("/")) t = t.substring(0, t.length() - 1);
        return t;
    }

    // ── Path / verb matching ────────────────────────────────────────────

    private boolean verbMatches(String endpointVerb, String callVerb) {
        if (endpointVerb == null || endpointVerb.isBlank()) return true;
        // fetch()/<form> calls don't carry a verb — match by path alone.
        if (callVerb == null || callVerb.isBlank()) return true;
        return endpointVerb.equalsIgnoreCase(callVerb);
    }

    private boolean pathsMatch(String a, String b) {
        if (a == null || b == null) return false;
        return normPath(a).equals(normPath(b));
    }

    private String normPath(String p) {
        return stripExt(stripApi(p));
    }

    private String stripApi(String p) {
        if (p.startsWith("/api/")) return p.substring(4);
        if (p.equals("/api")) return "/";
        return p;
    }

    /** Drop a Struts action extension so a JSP form's {@code /x.do} matches the
     *  {@code /x} mapping in struts.xml. */
    private String stripExt(String p) {
        if (p.endsWith(".do")) return p.substring(0, p.length() - 3);
        if (p.endsWith(".action")) return p.substring(0, p.length() - 7);
        return p;
    }

    // ── Small path helpers ──────────────────────────────────────────────

    private String baseName(String file) {
        String f = file.replace('\\', '/');
        return f.substring(f.lastIndexOf('/') + 1);
    }

    private String relativize(Path root, String file) {
        try {
            return root.relativize(Path.of(file)).toString().replace('\\', '/');
        } catch (Exception e) {
            return baseName(file);
        }
    }

    private String parentDir(String relPath) {
        String p = relPath.replace('\\', '/');
        int slash = p.lastIndexOf('/');
        return slash > 0 ? p.substring(0, slash) : "front-end";
    }
}
