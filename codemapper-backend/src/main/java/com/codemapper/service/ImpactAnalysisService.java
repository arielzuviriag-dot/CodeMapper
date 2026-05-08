package com.codemapper.service;

import com.codemapper.model.domain.SessionData;
import com.codemapper.model.dto.ImpactReport;
import com.codemapper.parser.SymbolSolverConfigurer;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.resolution.types.ResolvedType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * F4 — "Simular cambio". Given a focus class, walks the entire project to
 * build an inverse callgraph (FQN → set of FQNs that reference it) and
 * BFSes outward up to {@code depth} hops to compute the transitive impact:
 * which classes would break if the focus's contract changed, which tests
 * would need re-running, and whether the focus participates in a cycle.
 *
 * The walk is on-demand and parses every {@code .java} file in the project
 * — this is the costly path, but FOCO sessions don't have a full callgraph
 * pre-built. Cached per session in {@link SessionData} would be a future
 * optimization; for now each impact request re-walks.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ImpactAnalysisService {

    private final SymbolSolverConfigurer symbolSolverConfigurer;
    private final JavaVersionDetector javaVersionDetector;

    public ImpactReport computeImpact(SessionData session, String focusFqn, int depth) throws IOException {
        if (focusFqn == null || focusFqn.isBlank()) {
            return emptyReport();
        }
        Path projectRoot = session.getProjectPath();
        if (projectRoot == null) {
            return emptyReport();
        }
        // Configure the parser the same way the focus tracer did so symbol
        // resolution behaves identically across this analysis pass.
        symbolSolverConfigurer.configure(projectRoot, javaVersionDetector.detect(projectRoot));

        // Build inverse callgraph: callee FQN → set of caller FQNs.
        // Path lookup map so the test classifier (later) can resolve fqn→path.
        Map<String, Set<String>> callers = new HashMap<>();
        Map<String, String> fqnToPath = new HashMap<>();

        List<Path> javaFiles = collectJavaFiles(projectRoot);
        log.info("Impact analysis: walking {} java files for callers of {}", javaFiles.size(), focusFqn);

        for (Path file : javaFiles) {
            CompilationUnit cu;
            try {
                cu = StaticJavaParser.parse(file.toFile());
            } catch (Exception e) {
                continue;
            }
            String pkg = cu.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("");
            for (TypeDeclaration<?> td : cu.getTypes()) {
                String classFqn = pkg.isEmpty()
                        ? td.getNameAsString()
                        : pkg + "." + td.getNameAsString();
                fqnToPath.put(classFqn, file.toString());

                Set<String> referenced = collectReferencedFqns(td);
                for (String ref : referenced) {
                    if (ref.equals(classFqn)) continue;
                    callers.computeIfAbsent(ref, k -> new HashSet<>()).add(classFqn);
                }
            }
        }

        // BFS hacia atrás desde focusFqn por la relación "X is called by Y".
        Set<String> direct = new LinkedHashSet<>(
                callers.getOrDefault(focusFqn, Set.of()));
        Set<String> all = new LinkedHashSet<>(direct);
        Deque<String> frontier = new ArrayDeque<>(direct);
        Map<String, Integer> distance = new HashMap<>();
        for (String d : direct) distance.put(d, 1);

        while (!frontier.isEmpty()) {
            String current = frontier.poll();
            int currDist = distance.getOrDefault(current, depth);
            if (currDist >= depth) continue;
            for (String caller : callers.getOrDefault(current, Set.of())) {
                if (caller.equals(focusFqn)) continue; // cycle detected separately
                if (all.add(caller)) {
                    distance.put(caller, currDist + 1);
                    frontier.add(caller);
                }
            }
        }

        // Cycle detection: a cycle exists when the focus reaches itself by
        // following the SAME callers→callee direction. We BFS forward (focus
        // calls X, X calls Y, ...) up to the same depth and check for focus.
        // For simplicity we just check whether focusFqn appears in the
        // forward closure of itself.
        Set<String> forwardClosure = new HashSet<>();
        // Inverse map: caller FQN → callee FQNs it references. Reuse the
        // referenced sets we already collected (one second pass over files
        // would duplicate work, so we rebuild from `callers` map: for each
        // (callee, callers), add (caller → callee) to forward map).
        Map<String, Set<String>> forward = new HashMap<>();
        for (var entry : callers.entrySet()) {
            for (String caller : entry.getValue()) {
                forward.computeIfAbsent(caller, k -> new HashSet<>()).add(entry.getKey());
            }
        }
        Deque<String> fwdFrontier = new ArrayDeque<>(forward.getOrDefault(focusFqn, Set.of()));
        Map<String, Integer> fwdDist = new HashMap<>();
        for (String n : fwdFrontier) fwdDist.put(n, 1);
        boolean hasCycle = false;
        List<List<String>> cycles = new ArrayList<>();
        while (!fwdFrontier.isEmpty()) {
            String current = fwdFrontier.poll();
            int currDist = fwdDist.getOrDefault(current, depth);
            if (currDist >= depth) continue;
            for (String next : forward.getOrDefault(current, Set.of())) {
                if (focusFqn.equals(next)) {
                    hasCycle = true;
                    cycles.add(List.of(focusFqn, current, focusFqn));
                    continue;
                }
                if (forwardClosure.add(next)) {
                    fwdDist.put(next, currDist + 1);
                    fwdFrontier.add(next);
                }
            }
        }

        // Test partitioning by path. Anything under /test/java/ is a test.
        List<String> tests = new ArrayList<>();
        List<String> directList = new ArrayList<>(direct);
        List<String> transitiveList = new ArrayList<>();
        for (String fqn : all) {
            String path = fqnToPath.get(fqn);
            if (path != null && isTestPath(path)) {
                tests.add(fqn);
            }
            if (!direct.contains(fqn)) {
                transitiveList.add(fqn);
            }
        }

        // Plan rule: only quantity is gated, never which info you can see.
        // Both FREE and PRO get the full impact report — the graph itself
        // already enforces the 10-peripheral cap upstream, so the highlight
        // overlay just colors whichever peripherals are visible.
        ImpactReport report = new ImpactReport(
                all.size(),
                tests.size(),
                hasCycle,
                directList,
                transitiveList,
                tests,
                cycles
        );

        log.info("Impact analysis for {}: total={}, tests={}, cycles={}, pro={}",
                focusFqn, all.size(), tests.size(), hasCycle, session.isPro());
        return report;
    }

    private ImpactReport emptyReport() {
        return new ImpactReport(0, 0, false, List.of(), List.of(), List.of(), List.of());
    }

    /** Collect every external type FQN this declaration references — same
     *  shape as FocusTracerService.collectAllReferencedFqns but inlined here
     *  to keep the impact service self-contained. Method bodies are NOT
     *  walked (signature-only), matching the F0/F1 invariant. */
    private Set<String> collectReferencedFqns(TypeDeclaration<?> td) {
        Set<String> out = new LinkedHashSet<>();
        for (FieldDeclaration field : td.getFields()) {
            for (VariableDeclarator var : field.getVariables()) {
                collectTypeFqnsRec(var.getType(), out);
            }
        }
        for (var member : td.getMembers()) {
            if (member instanceof MethodDeclaration md) {
                collectTypeFqnsRec(md.getType(), out);
                for (Parameter p : md.getParameters()) {
                    collectTypeFqnsRec(p.getType(), out);
                }
            } else if (member instanceof ConstructorDeclaration cd) {
                for (Parameter p : cd.getParameters()) {
                    collectTypeFqnsRec(p.getType(), out);
                }
            }
        }
        if (td instanceof com.github.javaparser.ast.body.ClassOrInterfaceDeclaration coi) {
            for (ClassOrInterfaceType ext : coi.getExtendedTypes()) {
                resolveFqn(ext).ifPresent(out::add);
            }
            for (ClassOrInterfaceType impl : coi.getImplementedTypes()) {
                resolveFqn(impl).ifPresent(out::add);
            }
        }
        return out;
    }

    private void collectTypeFqnsRec(Type type, Set<String> out) {
        if (type == null || !type.isClassOrInterfaceType()) return;
        ClassOrInterfaceType cot = type.asClassOrInterfaceType();
        try {
            ResolvedType resolved = cot.resolve();
            if (resolved.isReferenceType()) {
                String fqn = resolved.asReferenceType().getQualifiedName();
                if (fqn != null) out.add(fqn);
            }
        } catch (Exception ignored) {
            // unresolvable — skip
        }
        cot.getTypeArguments().ifPresent(args -> {
            for (Type arg : args) collectTypeFqnsRec(arg, out);
        });
    }

    private java.util.Optional<String> resolveFqn(ClassOrInterfaceType type) {
        try {
            ResolvedType r = type.resolve();
            if (r.isReferenceType()) {
                return java.util.Optional.ofNullable(r.asReferenceType().getQualifiedName());
            }
        } catch (Exception ignored) {
        }
        return java.util.Optional.empty();
    }

    private boolean isTestPath(String path) {
        if (path == null) return false;
        String norm = path.replace('\\', '/');
        return norm.contains("/src/test/java/") || norm.contains("/test/java/");
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
