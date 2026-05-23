package com.codemapper.service;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.domain.ParsedClass;
import com.codemapper.model.domain.SessionData;
import com.codemapper.model.dto.UnresolvedReference;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.ErrorEvent;
import com.codemapper.model.event.FocusClassLoadedEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import com.codemapper.model.event.LimitReachedEvent;
import com.codemapper.model.event.SessionCompleteEvent;
import com.codemapper.model.event.SessionStartEvent;
import com.codemapper.model.event.UnresolvedReferenceEvent;
import com.codemapper.parser.ClassExtractor;
import com.codemapper.parser.FieldExtractor;
import com.codemapper.parser.MethodExtractor;
import com.codemapper.parser.SymbolSolverConfigurer;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.ClassExpr;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.MethodReferenceExpr;
import com.github.javaparser.ast.expr.NameExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.expr.SimpleName;
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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
    private final JavaVersionDetector javaVersionDetector;
    private final com.codemapper.parser.BehaviorAnnotationExtractor behaviorAnnotationExtractor;
    private final JacocoReportParser jacocoReportParser;

    /** Test-double annotations whose presence on a field of a CALLED_BY caller
     *  signals "this caller mocks the focus" — drives the mask icon on edges. */
    private static final java.util.Set<String> MOCK_ANNOTATION_NAMES = java.util.Set.of(
            "Mock", "MockBean", "SpyBean", "InjectMocks", "Spy"
    );

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
        String detectedJavaVersion = javaVersionDetector.detect(projectRoot);
        session.setDetectedJavaVersion(detectedJavaVersion);
        symbolSolverConfigurer.configure(projectRoot, detectedJavaVersion);

        sink.accept(new SessionStartEvent(session.getTotalFiles(), session.getProjectName(), start, detectedJavaVersion));

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

        java.util.List<com.codemapper.model.dto.BehaviorChip> behaviorChips =
                behaviorAnnotationExtractor.extract(focusType);

        // F3 — load Jacoco coverage if available. Returns Optional.empty when
        // the project has no jacoco.xml; the event ships null and the donut
        // simply won't render (silence over noise).
        java.util.Optional<com.codemapper.model.dto.JacocoCoverage> coverage =
                jacocoReportParser.findAndParse(projectRoot);
        Double focusCoverage = coverage.map(c -> c.classPercent(focusFqn)).orElse(null);
        java.util.Map<String, Double> focusMethodCoverage = new java.util.HashMap<>();
        if (coverage.isPresent()) {
            String fqnPrefix = focusFqn + ".";
            for (var entry : coverage.get().methodCoverage().entrySet()) {
                if (entry.getKey().startsWith(fqnPrefix)) {
                    focusMethodCoverage.put(entry.getKey().substring(fqnPrefix.length()), entry.getValue());
                }
            }
        }

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
                focusParsed.getLineCount(),
                behaviorChips,
                focusCoverage,
                focusMethodCoverage
        ));

        // ─── Walk project + classify each non-focus class ───────────────
        List<Path> projectFiles = collectJavaFiles(projectRoot);
        log.info("Focus session {}: scanning {} java files for relationships to {}",
                session.getSessionId(), projectFiles.size(), focusFqn);

        // F-deep: track which files were already classified during pass 1, so
        // pass 2 only revisits the rest. Also track which class FQNs were
        // already added as connections so deep-body analysis can skip them.
        Set<Path> filesProcessedInPass1 = new java.util.HashSet<>();
        Set<String> alreadyConnectedFqns = new java.util.HashSet<>();
        // Project root package — derived from the focus FQN so we can filter
        // body-resolution noise to "things that live in this project".
        String rootPackage = derivProjectRootPackage(focusFqn);
        log.debug("Focus session {}: project root package inferred as '{}'",
                session.getSessionId(), rootPackage);

        // Cache of CompilationUnits parsed during pass 1 — pass 2 reuses them
        // to avoid re-parsing every file. Keyed by absolute path.
        java.util.Map<Path, CompilationUnit> parsedCache = new java.util.HashMap<>();

        List<PendingConnection> extendsImplements = new ArrayList<>();
        List<PendingConnection> calledBy = new ArrayList<>();
        List<PendingConnection> calls = new ArrayList<>();
        // Diagnostics — emitted live to the frontend's panel as we discover
        // unresolvable references and unparseable files.
        List<UnresolvedReference> diagnostics = new ArrayList<>();

        for (Path file : projectFiles) {
            if (file.toAbsolutePath().normalize().equals(focusPath.toAbsolutePath().normalize())) {
                continue;
            }
            CompilationUnit cu;
            try {
                cu = StaticJavaParser.parse(file.toFile());
            } catch (Exception e) {
                log.debug("Skipping unparseable file {}: {}", file, e.getMessage());
                // F-deep: emit unparseable diagnostic so the dev sees the gap.
                UnresolvedReference unparseable = new UnresolvedReference(
                        UnresolvedReference.Kind.UNPARSEABLE,
                        file.toString(),
                        0,
                        "",
                        truncate(e.getMessage(), 200));
                diagnostics.add(unparseable);
                sink.accept(new UnresolvedReferenceEvent(unparseable));
                continue;
            }
            parsedCache.put(file, cu);
            String pkg = cu.getPackageDeclaration()
                    .map(p -> p.getNameAsString())
                    .orElse("");

            // F-deep: detect imports of the focus FQN at the top of the file.
            // If the file imports the focus, it almost certainly uses it —
            // even when the use lives in a method body (which signature-only
            // collection would miss).
            boolean importsFocus = importsFqn(cu, focusFqn);

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
                    alreadyConnectedFqns.add(pc.getFullyQualifiedName());
                    filesProcessedInPass1.add(file);
                    continue;
                }
                if (implementsList.contains(pc.getFullyQualifiedName())) {
                    extendsImplements.add(new PendingConnection(pc, FocusConnectionType.IMPLEMENTS));
                    alreadyConnectedFqns.add(pc.getFullyQualifiedName());
                    filesProcessedInPass1.add(file);
                    continue;
                }
                Set<String> incoming = collectAllReferencedFqns(td);
                if (incoming.contains(focusFqn)) {
                    calledBy.add(new PendingConnection(pc, FocusConnectionType.CALLED_BY, td));
                    alreadyConnectedFqns.add(pc.getFullyQualifiedName());
                    filesProcessedInPass1.add(file);
                    continue;
                }
                if (focusOutgoingFqns.contains(pc.getFullyQualifiedName())) {
                    calls.add(new PendingConnection(pc, FocusConnectionType.CALLS));
                    alreadyConnectedFqns.add(pc.getFullyQualifiedName());
                    filesProcessedInPass1.add(file);
                    continue;
                }
                // F-deep: signature didn't match but the file imports the
                // focus — promote to CALLED_BY. The body almost certainly
                // uses it (Java/IDE strip unused imports). Pass 2 will still
                // surface false negatives for cases where the import was
                // missed (e.g. same-package, no import needed).
                if (importsFocus) {
                    calledBy.add(new PendingConnection(pc, FocusConnectionType.CALLED_BY, td));
                    alreadyConnectedFqns.add(pc.getFullyQualifiedName());
                    filesProcessedInPass1.add(file);
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

        int pass1Total = ordered.size();
        boolean isPro = session.isPro();
        // P1 emit gets capped visually for FREE; P2 will run regardless and
        // (in FREE post-cap) will count silently to compute the honest total.
        // FREE uses proportional sampling per connection type (instead of a
        // raw subList) so minority buckets like CALLS or EXTENDS keep at least
        // one slot — without this, focusing on a class with 30 CALLED_BY + 2
        // CALLS would show ten CALLED_BY and hide the outgoing dependencies
        // entirely, which are usually the most informative.
        List<PendingConnection> pass1ToEmit = isPro
                ? ordered
                : proportionalSample(ordered, focusMaxConnections);

        log.info("Focus session {}: pass 1 found {} relationships ({} extends/implements, {} called_by, {} calls, {} properties), pro={}",
                session.getSessionId(),
                pass1Total,
                extendsImplements.size(),
                calledBy.size(),
                calls.size(),
                usesProperties.size(),
                isPro);

        // Emit pass 1 results with stagger. emitConnections may emit multiple
        // events per peripheral class (one per distinct invoked method) — so
        // position and emittedCount advance by the returned count, not by 1.
        int position = 0;
        int emittedCount = 0;
        for (PendingConnection pc : pass1ToEmit) {
            int emitted;
            try {
                emitted = emitConnections(sink, pc, position + 1, focusFqn, focusType, focusParsed.getName(), session, 60L);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                log.warn("Focus tracing interrupted for session {}", session.getSessionId());
                return;
            }
            position += emitted;
            emittedCount += emitted;
        }

        // ─── PASS 2 — deep body analysis (always runs) ─────────────────
        // P2 walks every file not classified in P1 and tries to resolve
        // method calls / object creations / etc. inside bodies.
        //
        // Two modes coexist inside the same loop:
        //   • EMIT mode: PRO always, OR FREE before reaching the visual cap.
        //     Each match is emitted live with stagger so the dev sees the
        //     graph grow during analysis.
        //   • SILENT-COUNT mode: FREE after the cap. Each match still bumps
        //     the detected counter (so the panel can show "10 / 32" honest)
        //     but no FocusConnectionEvent is emitted, no Thread.sleep happens
        //     — work cost stays only in the symbol resolver itself.
        //
        // Hard caps protect against pathological cases:
        //   • FREE: 200 detections → set `truncated`, break the walk. The
        //     frontend renders "200+" instead of an absolute number.
        //   • PRO: 5000 detections → log a warning and break silently
        //     (defensive — covers cases like focusing on `String` or `Object`
        //     where every file is a caller). User experience is unchanged
        //     because these cases are rare and 5000 is already overwhelming.
        final int FREE_HARD_CAP = 200;
        final int PRO_HARD_CAP = 5000;
        int pass2Detected = 0;
        int pass2Emitted = 0;
        boolean shouldEmit = isPro || emittedCount < focusMaxConnections;
        boolean truncated = false;
        String focusSimpleName = focusParsed.getName();

        outer:
        for (Path file : projectFiles) {
            if (filesProcessedInPass1.contains(file)) continue;
            if (file.toAbsolutePath().normalize().equals(focusPath.toAbsolutePath().normalize())) continue;

            CompilationUnit cu = parsedCache.get(file);
            if (cu == null) continue;

            String pkg = cu.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("");
            for (TypeDeclaration<?> td : cu.getTypes()) {
                // Hard cap check before extracting to avoid wasted work
                if (!isPro && pass2Detected >= FREE_HARD_CAP) {
                    truncated = true;
                    break outer;
                }
                if (isPro && pass2Detected >= PRO_HARD_CAP) {
                    log.warn("Focus session {}: PRO defensive cap reached ({} detections in pass 2). " +
                                    "This usually means focusing on an extremely common type (String, Object, etc). " +
                                    "Cutting walk to keep the session responsive.",
                            session.getSessionId(), pass2Detected);
                    break outer;
                }

                ParsedClass pc;
                try {
                    pc = classExtractor.extract(td, pkg, file.toString());
                    pc.setFields(fieldExtractor.extract(td));
                    pc.setMethods(methodExtractor.extract(td));
                } catch (Exception e) {
                    continue;
                }
                if (focusFqn.equals(pc.getFullyQualifiedName())) continue;
                if (alreadyConnectedFqns.contains(pc.getFullyQualifiedName())) continue;

                // Deep analysis — emits diagnostics along the way regardless
                // of FREE/PRO mode (diagnostics are info, not capped product).
                boolean foundFocus = analyzeBodyForFocus(
                        td, focusFqn, focusSimpleName, file, rootPackage, diagnostics, sink);
                if (!foundFocus) continue;

                pass2Detected++;
                alreadyConnectedFqns.add(pc.getFullyQualifiedName());

                if (shouldEmit) {
                    // Live emit path — stagger like P1 so the graph keeps
                    // populating during deep search. May emit multiple events
                    // when the caller invokes several distinct focus methods.
                    PendingConnection conn = new PendingConnection(
                            pc, FocusConnectionType.CALLED_BY, td);
                    int emitted;
                    try {
                        emitted = emitConnections(sink, conn, position + 1, focusFqn, focusType, focusSimpleName, session, 60L);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                    position += emitted;
                    emittedCount += emitted;
                    pass2Emitted += emitted;
                    // After emitting, did we just hit the FREE visual cap?
                    if (!isPro && emittedCount >= focusMaxConnections) {
                        // Stop emitting — but keep counting so the panel
                        // can report the honest total at the end.
                        shouldEmit = false;
                    }
                }
                // else: silent-count mode — no emit, no sleep, almost free
            }
        }

        log.info("Focus session {}: pass 2 detected {} ({} emitted, {} silent-counted), truncated={}",
                session.getSessionId(),
                pass2Detected,
                pass2Emitted,
                pass2Detected - pass2Emitted,
                truncated);

        // ─── LimitReachedEvent — only when FREE is actually capped ─────
        // The honest total is P1 + P2 detected (regardless of how many were
        // emitted). When truncated, it's >= FREE_HARD_CAP and the frontend
        // renders "200+".
        int realTotal = pass1Total + pass2Detected;
        boolean cappedFree = !isPro && emittedCount < realTotal;
        if (cappedFree) {
            sink.accept(new LimitReachedEvent(
                    focusMaxConnections,
                    realTotal,
                    emittedCount,
                    "Llegaste al límite de la versión FREE",
                    realTotal,
                    truncated));
        }

        long durationMs = Duration.between(start, Instant.now()).toMillis();
        sink.accept(new SessionCompleteEvent(
                1 + emittedCount,
                emittedCount,
                durationMs));
        session.setStatus(SessionData.Status.COMPLETED);

        log.info("Focus session {} done: focus + {} emitted ({} from pass 1, {} from pass 2), {} silent-counted in pass 2, realTotal={}, truncated={}, {} diagnostics, {} ms",
                session.getSessionId(),
                emittedCount,
                pass1ToEmit.size(),
                pass2Emitted,
                pass2Detected - pass2Emitted,
                realTotal,
                truncated,
                diagnostics.size(),
                durationMs);
    }

    /**
     * FREE-tier sampling. When {@code cap < ordered.size()}, build a subset
     * that guarantees one slot per connection type present and distributes
     * the remainder proportionally to each bucket's weight (largest-remainder
     * / Hare quota). On a fractional tie, the smaller bucket wins — the
     * point of this whole exercise is preserving minority types.
     *
     * Output order follows {@link FocusConnectionType#values()} so it stays
     * EXTENDS+IMPLEMENTS → CALLED_BY → CALLS → USES_PROPERTIES, the same
     * shape the graph and PDF have always presented.
     */
    private List<PendingConnection> proportionalSample(
            List<PendingConnection> ordered, int cap) {
        if (cap >= ordered.size()) return ordered;

        Map<FocusConnectionType, List<PendingConnection>> buckets = new LinkedHashMap<>();
        for (PendingConnection pc : ordered) {
            buckets.computeIfAbsent(pc.connectionType, k -> new ArrayList<>()).add(pc);
        }

        if (buckets.size() == 1) {
            return new ArrayList<>(ordered.subList(0, cap));
        }

        // Defensive: more buckets than slots (shouldn't happen with cap=10
        // and ≤5 enum values, but if focusMaxConnections is ever lowered).
        if (buckets.size() >= cap) {
            List<PendingConnection> trimmed = new ArrayList<>(cap);
            int taken = 0;
            for (FocusConnectionType t : FocusConnectionType.values()) {
                List<PendingConnection> bucket = buckets.get(t);
                if (bucket == null) continue;
                trimmed.add(bucket.get(0));
                if (++taken >= cap) break;
            }
            return trimmed;
        }

        int total = ordered.size();
        int remaining = cap - buckets.size();
        Map<FocusConnectionType, Integer> quota = new LinkedHashMap<>();
        Map<FocusConnectionType, Double> remainder = new LinkedHashMap<>();
        int assigned = 0;
        for (Map.Entry<FocusConnectionType, List<PendingConnection>> e : buckets.entrySet()) {
            double exact = (e.getValue().size() * (double) remaining) / total;
            int floor = (int) Math.floor(exact);
            quota.put(e.getKey(), 1 + floor);
            remainder.put(e.getKey(), exact - floor);
            assigned += floor;
        }

        // Distribute the leftover by largest remainder. Tiebreak: smaller
        // bucket wins (so a 30 CB + 2 CALLS focus, where both buckets land
        // at remainder=0.5, gives the spare slot to CALLS).
        int leftover = remaining - assigned;
        if (leftover > 0) {
            List<FocusConnectionType> ranked = new ArrayList<>(buckets.keySet());
            ranked.sort((a, b) -> {
                int cmp = Double.compare(remainder.get(b), remainder.get(a));
                if (cmp != 0) return cmp;
                return Integer.compare(buckets.get(a).size(), buckets.get(b).size());
            });
            for (int i = 0; i < leftover && i < ranked.size(); i++) {
                quota.merge(ranked.get(i), 1, Integer::sum);
            }
        }

        // A bucket may have been allocated more than it actually has.
        // Clamp and hand the slack to the largest bucket with room — keep
        // iterating until either the slack is gone or every bucket is full
        // (which can't happen here because cap < total, but the loop is
        // defensive).
        int slack = 0;
        for (Map.Entry<FocusConnectionType, List<PendingConnection>> e : buckets.entrySet()) {
            int q = quota.get(e.getKey());
            int avail = e.getValue().size();
            if (q > avail) {
                slack += q - avail;
                quota.put(e.getKey(), avail);
            }
        }
        if (slack > 0) {
            List<FocusConnectionType> byDominance = new ArrayList<>(buckets.keySet());
            byDominance.sort((a, b) -> Integer.compare(buckets.get(b).size(), buckets.get(a).size()));
            while (slack > 0) {
                boolean progressed = false;
                for (FocusConnectionType t : byDominance) {
                    if (quota.get(t) < buckets.get(t).size()) {
                        quota.merge(t, 1, Integer::sum);
                        slack--;
                        progressed = true;
                        if (slack == 0) break;
                    }
                }
                if (!progressed) break;
            }
        }

        List<PendingConnection> result = new ArrayList<>(cap);
        for (FocusConnectionType t : FocusConnectionType.values()) {
            List<PendingConnection> bucket = buckets.get(t);
            if (bucket == null) continue;
            int q = quota.get(t);
            result.addAll(bucket.subList(0, Math.min(q, bucket.size())));
        }
        return result;
    }

    /** Emit one or more FocusConnectionEvents for {@code pc} — one per unique
     *  method invoked across the peripheral/focus boundary. Returns the count
     *  of events emitted, so callers can advance their position/emit counters.
     *
     *  <p>Dedup is by INVOKED method name: if a caller has three call sites to
     *  {@code focus.save()} and one to {@code focus.delete()}, this emits two
     *  events (one for {@code save}, one for {@code delete}). For EXTENDS,
     *  IMPLEMENTS and USES_PROPERTIES — and for "structural-only" CALLED_BY
     *  cases where no call expression resolves to the target — a single event
     *  is emitted with {@code viaMethodInTarget = null}.</p>
     *
     *  <p>{@code sleepMs} between events keeps the SSE stream staggered so the
     *  frontend renders an animated graph instead of a sudden dump.</p>
     */
    private int emitConnections(
            Consumer<BaseEvent> sink,
            PendingConnection pc,
            int startPosition,
            String focusFqn,
            TypeDeclaration<?> focusType,
            String focusSimpleName,
            SessionData session,
            long sleepMs) throws InterruptedException {
        if (pc.connectionType != FocusConnectionType.USES_PROPERTIES) {
            session.getParsedClasses().add(pc.parsed);
        }

        List<InvocationInfo> invocations;
        if (pc.connectionType == FocusConnectionType.CALLED_BY && pc.callerTd != null) {
            invocations = findInvokedMethods(pc.callerTd, focusFqn);
        } else if (pc.connectionType == FocusConnectionType.CALLS) {
            invocations = findInvokedMethods(focusType, pc.parsed.getFullyQualifiedName());
        } else {
            // EXTENDS / IMPLEMENTS / USES_PROPERTIES — no per-method breakdown.
            invocations = Collections.singletonList(new InvocationInfo(null, null));
        }

        boolean isTest = isTestPath(pc.parsed.getFilePath());
        boolean isMock = isTest
                && pc.connectionType == FocusConnectionType.CALLED_BY
                && pc.callerTd != null
                && declaresMockOf(pc.callerTd, focusSimpleName);

        int pos = startPosition;
        int emitted = 0;
        for (InvocationInfo inv : invocations) {
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
                    pos++,
                    pc.parsed.getFilePath(),
                    inv.callerMethod,    // viaMethodInSource — method on the call-site side
                    inv.invokedMethod,   // viaMethodInTarget — method actually invoked
                    null,
                    isTest,
                    isMock));
            emitted++;
            if (sleepMs > 0L) {
                Thread.sleep(sleepMs);
            }
        }
        return emitted;
    }

    /** Pair of (caller-side method, invoked method on the target) used when
     *  emitting one event per distinct invoked method. */
    private static final class InvocationInfo {
        final String callerMethod;
        final String invokedMethod;

        InvocationInfo(String callerMethod, String invokedMethod) {
            this.callerMethod = callerMethod;
            this.invokedMethod = invokedMethod;
        }
    }

    /**
     * Returns the unique methods invoked on {@code targetFqn} from inside
     * {@code callerTd}, deduplicated by invoked-method name. Each entry pairs
     * (a) the caller-side method that contains the call with (b) the simple
     * name of the invoked method on the target.
     *
     * <p>If three call sites invoke {@code target.save()} and one invokes
     * {@code target.delete()} — even from different caller methods — the
     * result is two entries (one per invoked method). The first caller method
     * seen is used as the pair's caller field.</p>
     *
     * <p>When no call expression can be resolved against the target (e.g. the
     * relationship is structural — {@code @Autowired} field with no body
     * invocation), falls back to the existing signature/heuristic match and
     * returns one entry with {@code invokedMethod == null}. That preserves
     * the legacy "una arista por clase periférica" behavior for non-call
     * connections.</p>
     */
    private List<InvocationInfo> findInvokedMethods(TypeDeclaration<?> callerTd, String targetFqn) {
        Map<String, String> dedup = new LinkedHashMap<>();
        for (var member : callerTd.getMembers()) {
            if (!(member instanceof MethodDeclaration md)) continue;
            String callerMethod = md.getNameAsString();
            for (MethodCallExpr call : md.findAll(MethodCallExpr.class)) {
                try {
                    var resolved = call.resolve();
                    String declaring = resolved.declaringType().getQualifiedName();
                    if (targetFqn.equals(declaring)) {
                        String invokedName = resolved.getName();
                        dedup.putIfAbsent(invokedName, callerMethod);
                    }
                } catch (Exception ignored) {
                    // unresolvable — try next call
                }
            }
        }
        if (!dedup.isEmpty()) {
            List<InvocationInfo> result = new ArrayList<>(dedup.size());
            for (Map.Entry<String, String> e : dedup.entrySet()) {
                result.add(new InvocationInfo(e.getValue(), e.getKey()));
            }
            return result;
        }
        // No resolved calls — fall back to the existing 3-step heuristic for
        // a single representative caller method, with null invoked method.
        String fallbackCaller = findViaMethod(callerTd, targetFqn).orElse(null);
        return Collections.singletonList(new InvocationInfo(fallbackCaller, null));
    }

    // ───────────────────────────── helpers ────────────────────────────

    private static class PendingConnection {
        final ParsedClass parsed;
        final FocusConnectionType connectionType;
        /** TypeDeclaration of the *caller* class for CALLED_BY connections, used
         *  later to find which method on that side carries the relationship.
         *  Null for CALLS / EXTENDS / IMPLEMENTS / property files. */
        final TypeDeclaration<?> callerTd;

        PendingConnection(ParsedClass parsed, FocusConnectionType connectionType) {
            this(parsed, connectionType, null);
        }

        PendingConnection(ParsedClass parsed, FocusConnectionType connectionType, TypeDeclaration<?> callerTd) {
            this.parsed = parsed;
            this.connectionType = connectionType;
            this.callerTd = callerTd;
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

    /**
     * Finds a method on {@code td} that carries the relationship with
     * {@code targetFqn}. Prefers a method whose body contains a call resolving
     * to {@code targetFqn}; falls back to any method whose signature mentions
     * the target as a parameter or return type. Returns the simple method name
     * or {@link Optional#empty()} when no match is detectable.
     *
     * <p>This is the costly part of focus tracing because of symbol resolution
     * on every {@link MethodCallExpr} — we only run it for the connections we
     * actually emit (post-cap), keeping FREE-mode runs bounded.
     */
    private Optional<String> findViaMethod(TypeDeclaration<?> td, String targetFqn) {
        // 1) Prefer real call expressions inside method bodies.
        for (var member : td.getMembers()) {
            if (!(member instanceof MethodDeclaration md)) continue;
            for (MethodCallExpr call : md.findAll(MethodCallExpr.class)) {
                try {
                    String declaring = call.resolve().declaringType().getQualifiedName();
                    if (targetFqn.equals(declaring)) {
                        return Optional.of(md.getNameAsString());
                    }
                } catch (Exception ignored) {
                    // unresolvable — try next call
                }
            }
        }
        // 2) Fall back to a method whose signature mentions the target type.
        for (var member : td.getMembers()) {
            if (!(member instanceof MethodDeclaration md)) continue;
            Set<String> sig = new LinkedHashSet<>();
            collectTypeFqnsRec(md.getType(), sig);
            for (Parameter p : md.getParameters()) {
                collectTypeFqnsRec(p.getType(), sig);
            }
            if (sig.contains(targetFqn)) {
                return Optional.of(md.getNameAsString());
            }
        }
        // 3) Heuristic — when symbol resolution fails entirely (e.g. the
        // caller was promoted to CALLED_BY purely because it imports the
        // focus), find the method whose body simply MENTIONS the target's
        // simple name. Less precise than #1 / #2 but better than nothing —
        // gives the dev a place to look. Without this, the edge would show
        // "Llamado por" with no method label, leaving the user guessing.
        int lastDot = targetFqn.lastIndexOf('.');
        String simpleName = lastDot >= 0 ? targetFqn.substring(lastDot + 1) : targetFqn;
        if (!simpleName.isEmpty()) {
            for (var member : td.getMembers()) {
                if (!(member instanceof MethodDeclaration md)) continue;
                boolean mentions = md.findAll(com.github.javaparser.ast.expr.SimpleName.class)
                        .stream()
                        .anyMatch(sn -> simpleName.equals(sn.getIdentifier()));
                if (mentions) {
                    return Optional.of(md.getNameAsString());
                }
            }
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

    /** A connection is "test" when its source path lives under a test source
     *  root. Path is normalized to forward slashes so it works on Windows. */
    private boolean isTestPath(String path) {
        if (path == null) return false;
        String norm = path.replace('\\', '/');
        return norm.contains("/src/test/java/") || norm.contains("/test/java/");
    }

    /** True when {@code callerTd} declares a field annotated with one of the
     *  mock-stamp annotations (Mockito, Spring) AND the field's simple-name
     *  type matches {@code focusSimpleName}. Simple-name match is intentional
     *  — it works without symbol resolution and the false-positive risk
     *  ("a class with the same name from another package") is negligible
     *  inside a single project. */
    private boolean declaresMockOf(TypeDeclaration<?> callerTd, String focusSimpleName) {
        if (callerTd == null || focusSimpleName == null) return false;
        for (FieldDeclaration field : callerTd.getFields()) {
            boolean annotatedAsMock = false;
            for (AnnotationExpr ann : field.getAnnotations()) {
                if (MOCK_ANNOTATION_NAMES.contains(ann.getNameAsString())) {
                    annotatedAsMock = true;
                    break;
                }
            }
            if (!annotatedAsMock) continue;
            for (VariableDeclarator var : field.getVariables()) {
                Type t = var.getType();
                if (t.isClassOrInterfaceType()
                        && focusSimpleName.equals(t.asClassOrInterfaceType().getNameAsString())) {
                    return true;
                }
            }
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────────────────
    // F-deep helpers — pass 1 imports + pass 2 deep body analysis
    // ─────────────────────────────────────────────────────────────────────

    /** Derive a project-root package prefix from the focus FQN. We use the
     *  first 3 segments ("com.acme.project") which is the conventional Java
     *  org/team/project pattern. If the focus is in a package with fewer
     *  than 3 segments, we use the parent package as-is. Used to filter
     *  body-resolution to project classes only (skip JDK, frameworks). */
    private String derivProjectRootPackage(String focusFqn) {
        if (focusFqn == null || focusFqn.isBlank()) return "";
        int lastDot = focusFqn.lastIndexOf('.');
        if (lastDot < 0) return "";
        String pkg = focusFqn.substring(0, lastDot);
        String[] parts = pkg.split("\\.");
        if (parts.length <= 3) return pkg;
        return parts[0] + "." + parts[1] + "." + parts[2];
    }

    /** True when the file imports {@code focusFqn} explicitly. We accept
     *  exact-match imports as well as wildcard imports of the focus's
     *  package (which would also bring the focus into scope). */
    private boolean importsFqn(CompilationUnit cu, String focusFqn) {
        if (cu == null || focusFqn == null) return false;
        int lastDot = focusFqn.lastIndexOf('.');
        String focusPkg = lastDot > 0 ? focusFqn.substring(0, lastDot) : "";
        for (ImportDeclaration imp : cu.getImports()) {
            String name = imp.getNameAsString();
            if (focusFqn.equals(name)) return true;
            if (imp.isAsterisk() && !focusPkg.isEmpty() && focusPkg.equals(name)) {
                return true;
            }
        }
        return false;
    }

    /** Pass 2 — deep body analysis. Walks every method body in {@code td}
     *  and tries to resolve method calls / object creations / class refs /
     *  instanceof / method references back to the focus FQN.
     *
     *  Diagnostics:
     *  <ul>
     *    <li>Whenever resolution fails on an expression that *might* be a
     *    project reference (or carries the focus's simple name), an
     *    {@link UnresolvedReference} of kind UNRESOLVED is recorded and
     *    streamed.</li>
     *    <li>If the focus's simple name appears textually in a body but no
     *    resolved expression confirmed it, a FALSE_NEGATIVE is recorded.</li>
     *  </ul>
     *
     *  Returns true the moment a focus reference is confirmed — the caller
     *  uses that to decide whether to add a CALLED_BY connection. */
    private boolean analyzeBodyForFocus(
            TypeDeclaration<?> td,
            String focusFqn,
            String focusSimpleName,
            Path file,
            String rootPackage,
            List<UnresolvedReference> diagnostics,
            Consumer<BaseEvent> sink) {
        boolean confirmed = false;
        boolean simpleNameSeen = false;

        // 1) Method calls — most common path: someInstance.method() where
        //    method belongs to focus.
        for (MethodCallExpr call : td.findAll(MethodCallExpr.class)) {
            try {
                String declaring = call.resolve().declaringType().getQualifiedName();
                if (focusFqn.equals(declaring)) {
                    confirmed = true;
                    break;
                }
            } catch (Exception e) {
                // Resolution failed. Only record as UNRESOLVED diagnostic
                // when the call could plausibly be a project reference.
                if (looksLikeProjectReference(call.toString(), focusSimpleName, rootPackage)) {
                    emitDiag(diagnostics, sink, UnresolvedReference.Kind.UNRESOLVED,
                            file, lineOf(call), call.toString(),
                            truncate(e.getMessage(), 140));
                }
            }
        }

        if (!confirmed) {
            // 2) Object creation — `new User(...)`.
            for (ObjectCreationExpr expr : td.findAll(ObjectCreationExpr.class)) {
                try {
                    String resolvedFqn = expr.calculateResolvedType()
                            .asReferenceType().getQualifiedName();
                    if (focusFqn.equals(resolvedFqn)) {
                        confirmed = true;
                        break;
                    }
                } catch (Exception e) {
                    String name = expr.getType().getNameAsString();
                    if (focusSimpleName.equals(name)) {
                        emitDiag(diagnostics, sink, UnresolvedReference.Kind.UNRESOLVED,
                                file, lineOf(expr), expr.toString(),
                                truncate(e.getMessage(), 140));
                    }
                }
            }
        }

        if (!confirmed) {
            // 3) Class literal — `User.class`.
            for (ClassExpr expr : td.findAll(ClassExpr.class)) {
                try {
                    ResolvedType rt = expr.calculateResolvedType();
                    // ClassExpr resolves to Class<T>, we need T.
                    if (rt.isReferenceType()) {
                        var args = rt.asReferenceType().typeParametersValues();
                        if (!args.isEmpty() && args.get(0).isReferenceType()
                                && focusFqn.equals(args.get(0).asReferenceType().getQualifiedName())) {
                            confirmed = true;
                            break;
                        }
                    }
                } catch (Exception ignored) {
                    // Skip — class literals rarely fail and the diagnostic
                    // signal/noise ratio is poor here.
                }
            }
        }

        if (!confirmed) {
            // 4) Method reference — `User::factory`.
            for (MethodReferenceExpr expr : td.findAll(MethodReferenceExpr.class)) {
                try {
                    String declaring = expr.resolve().declaringType().getQualifiedName();
                    if (focusFqn.equals(declaring)) {
                        confirmed = true;
                        break;
                    }
                } catch (Exception ignored) {
                    // Symbol resolver is shaky on method refs; skip silently.
                }
            }
        }

        if (!confirmed) {
            // 5) NameExpr — bare references like `User.STATIC_FIELD`. We only
            //    log a false-negative if the bare name matches the focus's
            //    simple name and resolution didn't confirm anything else.
            for (NameExpr expr : td.findAll(NameExpr.class)) {
                if (focusSimpleName.equals(expr.getNameAsString())) {
                    simpleNameSeen = true;
                    break;
                }
            }
            for (SimpleName sn : td.findAll(SimpleName.class)) {
                if (focusSimpleName.equals(sn.getIdentifier())) {
                    simpleNameSeen = true;
                    break;
                }
            }
        }

        if (!confirmed && simpleNameSeen) {
            // The focus's simple name appears in the body but resolution
            // didn't link it. Could be a same-named class from another
            // package or a real reference we missed.
            emitDiag(diagnostics, sink, UnresolvedReference.Kind.FALSE_NEGATIVE,
                    file, 0, focusSimpleName,
                    "Mention found, no symbol resolved");
        }

        return confirmed;
    }

    /** Heuristic — is this expression likely a project reference rather than
     *  a JDK/framework call? We only emit UNRESOLVED diagnostics for these
     *  to keep noise down. */
    private boolean looksLikeProjectReference(String expr, String focusSimpleName, String rootPackage) {
        if (expr == null || focusSimpleName == null) return false;
        if (expr.contains(focusSimpleName)) return true;
        if (!rootPackage.isEmpty() && expr.contains(rootPackage)) return true;
        return false;
    }

    private int lineOf(Node node) {
        return node.getRange().map(r -> r.begin.line).orElse(0);
    }

    private void emitDiag(
            List<UnresolvedReference> diagnostics,
            Consumer<BaseEvent> sink,
            UnresolvedReference.Kind kind,
            Path file,
            int line,
            String snippet,
            String reason) {
        UnresolvedReference ref = new UnresolvedReference(
                kind,
                file == null ? "" : file.toString(),
                line,
                truncate(snippet, 200),
                reason == null ? "" : reason);
        diagnostics.add(ref);
        sink.accept(new UnresolvedReferenceEvent(ref));
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        if (s.length() <= max) return s;
        return s.substring(0, max - 1) + "…";
    }
}
