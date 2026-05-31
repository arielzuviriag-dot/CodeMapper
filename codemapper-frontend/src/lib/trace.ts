/* ============================================================
 * "Escuchando" mode — live execution tracing types + graph builder.
 *
 * The backend pushes one {@link TraceSpan} per OpenTelemetry span over SSE.
 * From the flat span stream we build a CLASS graph: one node per unique class
 * that ran, edges parent-class → child-class following the span tree.
 *
 * Two things make this non-trivial and are handled here:
 *   1. Out-of-order arrival — OTel batches spans and a child can arrive before
 *      its parent. We sidestep ordering entirely by rebuilding the whole graph
 *      from the accumulated span map on every flush (traces are small: tens to
 *      low-hundreds of spans).
 *   2. Bridging — many spans (framework, JDBC, HTTP client) carry no
 *      code.namespace. We don't draw nodes for them, but we DO walk through
 *      them: a class node's parent is its nearest ANCESTOR span that has a
 *      class, so A → (DispatcherServlet) → B yields a clean A → B edge.
 * ============================================================ */

export interface TraceError {
  type: string | null;
  message: string | null;
  stacktrace: string | null;
}

export interface TraceSpan {
  traceId: string | null;
  spanId: string;
  parentSpanId: string | null;
  fqcn: string | null;
  className: string | null;
  method: string | null;
  spanName: string | null;
  /** Best-effort request URL/path of the root HTTP span (null for internal
   *  spans). Used to filter the live graph to a chosen URL. */
  httpUrl: string | null;
  status: "OK" | "ERROR" | "UNSET";
  /** Span start time in nanos since epoch — drives execution-order numbering. */
  startUnixNano: number;
  durationMs: number;
  error: TraceError | null;
}

export interface ClassNode {
  /** Display label + unique id. A Java class name, or for an HTTP-entry node
   *  the request label (e.g. "GET /api/users"). */
  className: string;
  /** True when this node is an HTTP request that didn't reach an instrumented
   *  class (e.g. a 401 that stopped at security, or an uninstrumented route).
   *  Shown so you always see the call happened, even without your code. */
  isHttp: boolean;
  fqcn: string | null;
  /** Distinct methods seen for this class, in first-seen order — the pills. */
  methods: string[];
  status: "OK" | "ERROR" | "UNSET";
  /** BFS depth from the root class (root = 0). Drives the radial ring. */
  depth: number;
  /** 1-based rank in execution order (by earliest span start time). The badge
   *  on the node shows this so you can read the call sequence 1 → 2 → 3 … */
  order: number;
  /** Earliest span start time (nanos) for this class — the ordering key. */
  startNano: number;
  /** Date.now() of the first span for this class — anchors entrance stagger. */
  firstSeen: number;
  /** How many spans hit this class — used to re-pulse on repeat calls. */
  hitCount: number;
  /** Latest exception detail if any span for this class errored. */
  error: TraceError | null;
  /** Request URL of an HTTP-entry node (used to match it to a front screen). */
  httpUrl?: string | null;
  /** True for an injected front-end screen node (not from a Java span). */
  isScreen?: boolean;
  /** "web" | "mobile" for a screen node — drives the globe/phone icon. */
  screenKind?: "web" | "mobile";
}

/** A front-end screen that calls an endpoint (from the front scan) — used to
 *  inject "which screen triggered this" into the live listening graph. */
export interface ScreenLink {
  verb: string;
  path: string;
  screen: string;
  mobile: boolean;
}

export interface ClassEdge {
  id: string;
  source: string;
  target: string;
  firstSeen: number;
  /** Distinct methods invoked on the target class via this call, first-seen
   *  order — shown on the edge label ("a qué método se llama"). */
  methods: string[];
  /** How many times this exact call (source → target) happened — the call
   *  count between the two classes ("el número de llamada"). */
  count: number;
  /** True when the reverse call (target → source) also exists — i.e. the two
   *  classes call each other ("va y vuelve"). */
  bidirectional: boolean;
}

export interface TraceGraph {
  nodes: ClassNode[];
  edges: ClassEdge[];
  rootClassName: string | null;
  /** Persisted first-seen stamps so a rebuild doesn't restart animations. */
  classFirstSeen: Record<string, number>;
  edgeFirstSeen: Record<string, number>;
}

/** Which kind of nodes the live graph shows:
 *  - "all"  — both HTTP entries and Java classes (default).
 *  - "web"  — only the HTTP request entries (GET/POST /api/...).
 *  - "java" — only the instrumented Java classes.
 *  The view is applied when deciding what counts as a node, so rings, order
 *  and edges are all recomputed consistently for the chosen subset. */
export type TraceView = "all" | "web" | "java";

/** True when a span is an HTTP server entry (a request that may not have
 *  reached instrumented code — shown so you always SEE the call happened). */
function isHttpEntry(span: TraceSpan): boolean {
  return !span.className && !!span.httpUrl;
}

/** The graph key for a span under the current view, or null if it shouldn't be
 *  its own node. A span becomes a node if it's an instrumented class (className)
 *  OR an HTTP server entry (httpUrl) — subject to the view filter. */
function nodeKeyOf(span: TraceSpan, view: TraceView = "all"): string | null {
  if (view === "web") {
    return isHttpEntry(span) ? span.spanName || span.httpUrl : null;
  }
  if (view === "java") {
    return span.className ?? null;
  }
  if (span.className) return span.className;
  if (span.httpUrl) return span.spanName || span.httpUrl;
  return null;
}

/** Walk up parentSpanId until we hit an ancestor span that is itself a node
 *  (under the current view). Returns its key, or null at the root / missing
 *  parent. This bridges through uninstrumented spans AND, in a filtered view,
 *  through the hidden kind (e.g. in "java" a class's parent is its nearest
 *  ancestor CLASS, skipping the HTTP entry in between). */
function nearestNodeAncestor(
  span: TraceSpan,
  byId: Record<string, TraceSpan>,
  view: TraceView = "all",
): string | null {
  let current = span.parentSpanId ? byId[span.parentSpanId] : undefined;
  const guard = new Set<string>([span.spanId]); // cycle guard (shouldn't happen)
  while (current) {
    if (guard.has(current.spanId)) return null;
    guard.add(current.spanId);
    const key = nodeKeyOf(current, view);
    if (key) return key;
    current = current.parentSpanId ? byId[current.parentSpanId] : undefined;
  }
  return null;
}

/**
 * Rebuild the class graph from the accumulated span map. Pure: pass the
 * previous first-seen maps so node/edge animations keep their original anchor
 * across rebuilds; the returned maps fold in any newcomers.
 */
export function buildTraceGraph(
  byId: Record<string, TraceSpan>,
  prevClassFirstSeen: Record<string, number>,
  prevEdgeFirstSeen: Record<string, number>,
  now: number,
  urlFilter = "",
  view: TraceView = "all",
  screenIndex: ScreenLink[] = [],
): TraceGraph {
  const classFirstSeen = { ...prevClassFirstSeen };
  const edgeFirstSeen = { ...prevEdgeFirstSeen };

  const nodes = new Map<string, ClassNode>();
  const childToParent = new Map<string, string>(); // class → its class-parent
  const edgeKeys = new Set<string>();
  const edgeCount = new Map<string, number>(); // key → # of calls
  const edgeMethods = new Map<string, string[]>(); // key → methods on target
  const rootCandidates: string[] = [];

  // URL filter — the user can scope the live graph to traces of a chosen URL
  // (a substring of the request URL). The URL lives on each trace's root HTTP
  // span; we map traceId → url, then keep only spans whose trace matches. Empty
  // filter = listen to everything.
  const allSpans = Object.values(byId);
  // Normalize so a full URL pasted with scheme ("http://localhost:8085/")
  // matches the captured URL (which has no scheme, e.g. "localhost:8085/login").
  // Drop scheme + trailing slash, lowercase. Substring match → a base URL
  // matches all its paths; a path fragment matches just that.
  const norm = (s: string) =>
    s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const filter = norm(urlFilter);
  let spans = allSpans;
  if (filter) {
    const traceUrl = new Map<string, string>();
    for (const s of allSpans) {
      if (s.httpUrl && s.traceId && !traceUrl.has(s.traceId)) {
        traceUrl.set(s.traceId, s.httpUrl);
      }
    }
    spans = allSpans.filter(
      (s) =>
        s.traceId !== null &&
        norm(traceUrl.get(s.traceId) ?? "").includes(filter),
    );
  }

  // Pass 1 — materialize a node per class OR HTTP entry, accumulate
  // methods/status/hits.
  for (const span of spans) {
    const cn = nodeKeyOf(span, view);
    if (!cn) continue;

    if (classFirstSeen[cn] === undefined) classFirstSeen[cn] = now;

    let node = nodes.get(cn);
    if (!node) {
      node = {
        className: cn,
        isHttp: !span.className,
        fqcn: span.fqcn,
        methods: [],
        status: "UNSET",
        depth: 0,
        order: 0,
        startNano: Number.POSITIVE_INFINITY,
        firstSeen: classFirstSeen[cn],
        hitCount: 0,
        error: null,
        httpUrl: span.httpUrl,
      };
      nodes.set(cn, node);
    }
    node.hitCount += 1;
    // Earliest span start time across this class's spans = when execution
    // first entered the class. 0 means the agent didn't report a start time.
    if (span.startUnixNano > 0 && span.startUnixNano < node.startNano) {
      node.startNano = span.startUnixNano;
    }
    if (span.fqcn && !node.fqcn) node.fqcn = span.fqcn;
    if (span.method && !node.methods.includes(span.method)) {
      node.methods.push(span.method);
    }
    // ERROR is sticky — once a class threw, keep it red with the detail.
    if (span.status === "ERROR") {
      node.status = "ERROR";
      if (span.error) node.error = span.error;
    } else if (node.status !== "ERROR" && span.status === "OK") {
      node.status = "OK";
    }
  }

  // Pass 2 — resolve parent (with bridging) and collect edges.
  for (const span of spans) {
    const cn = nodeKeyOf(span, view);
    if (!cn) continue;
    const parent = nearestNodeAncestor(span, byId, view);
    if (parent && parent !== cn) {
      const key = `${parent}__${cn}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        if (edgeFirstSeen[key] === undefined) edgeFirstSeen[key] = now;
      }
      // Count every call and record the method invoked on the target (this
      // span's code.function), so the edge label can show method + call count.
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      if (span.method) {
        const ms = edgeMethods.get(key) ?? [];
        if (!ms.includes(span.method)) {
          ms.push(span.method);
          edgeMethods.set(key, ms);
        }
      }
      // First parent wins as the tree parent for depth purposes.
      if (!childToParent.has(cn)) childToParent.set(cn, parent);
    } else if (!childToParent.has(cn)) {
      rootCandidates.push(cn);
    }
  }

  // Inject front-end screen nodes: for each HTTP-entry node, attach the
  // screen(s) whose call matches its route (from the front scan), so the live
  // graph shows WHICH SCREEN triggered the request. The screen sits one ring
  // out from the entry with an arrow screen → entry.
  if (screenIndex.length > 0) {
    const cleanPath = (p: string): string => {
      let s = (p || "").split("?")[0];
      if (s.startsWith("/api/")) s = s.slice(4);
      if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
      return s.replace(/\{[^}]*\}/g, "{}").toLowerCase();
    };
    const routeOf = (node: ClassNode): string | null => {
      const m = node.className.match(/\s(\/\S*)$/); // "GET /api/x" → "/api/x"
      if (m) return m[1];
      if (node.httpUrl) {
        const i = node.httpUrl.indexOf("/");
        return i >= 0 ? node.httpUrl.slice(i) : null;
      }
      return null;
    };
    for (const entry of [...nodes.values()]) {
      if (!entry.isHttp) continue;
      const route = routeOf(entry);
      if (!route) continue;
      const rk = cleanPath(route);
      for (const sc of screenIndex) {
        if (cleanPath(sc.path) !== rk) continue;
        const screenKey = `screen:${sc.screen}`;
        if (!nodes.has(screenKey)) {
          if (classFirstSeen[screenKey] === undefined) classFirstSeen[screenKey] = now;
          nodes.set(screenKey, {
            className: sc.screen,
            isHttp: false,
            isScreen: true,
            screenKind: sc.mobile ? "mobile" : "web",
            fqcn: null,
            methods: [],
            status: "UNSET",
            depth: 0,
            order: 0,
            startNano: Number.POSITIVE_INFINITY,
            firstSeen: classFirstSeen[screenKey],
            hitCount: 1,
            error: null,
            httpUrl: null,
          });
        }
        const ekey = `${screenKey}__${entry.className}`;
        if (!edgeKeys.has(ekey)) {
          edgeKeys.add(ekey);
          if (edgeFirstSeen[ekey] === undefined) edgeFirstSeen[ekey] = now;
        }
        edgeCount.set(ekey, (edgeCount.get(ekey) ?? 0) + 1);
        if (!childToParent.has(screenKey)) {
          childToParent.set(screenKey, entry.className);
        }
      }
    }
  }

  // Root = the earliest-seen class with no class-parent.
  let rootClassName: string | null = null;
  for (const cn of rootCandidates) {
    if (
      rootClassName === null ||
      (nodes.get(cn)?.firstSeen ?? Infinity) <
        (nodes.get(rootClassName)?.firstSeen ?? Infinity)
    ) {
      rootClassName = cn;
    }
  }
  // No clean root (e.g. every class has a parent due to a cycle) → fall back
  // to the earliest class overall so there's always a center.
  if (rootClassName === null && nodes.size > 0) {
    rootClassName = [...nodes.values()].sort(
      (a, b) => a.firstSeen - b.firstSeen,
    )[0].className;
  }

  // Pass 3 — BFS depth from root over the parent map (child→parent), so each
  // ring is "one call deeper". Classes unreachable from root keep depth 0+1.
  if (rootClassName) {
    const childrenOf = new Map<string, string[]>();
    childToParent.forEach((parent, child) => {
      const arr = childrenOf.get(parent) ?? [];
      arr.push(child);
      childrenOf.set(parent, arr);
    });
    const queue: Array<{ cn: string; depth: number }> = [
      { cn: rootClassName, depth: 0 },
    ];
    const visited = new Set<string>();
    while (queue.length) {
      const { cn, depth } = queue.shift()!;
      if (visited.has(cn)) continue;
      visited.add(cn);
      const node = nodes.get(cn);
      if (node) node.depth = depth;
      for (const child of childrenOf.get(cn) ?? []) {
        if (!visited.has(child)) queue.push({ cn: child, depth: depth + 1 });
      }
    }
    // Anything not reached (orphan branch whose parent class never arrived):
    // park it on ring 1 so it's still visible.
    nodes.forEach((node) => {
      if (!visited.has(node.className) && node.className !== rootClassName) {
        node.depth = Math.max(1, node.depth);
      }
    });
  }

  // Execution-order numbering — rank classes by the earliest span start time.
  // Classes whose spans reported a start time sort first (by that time); any
  // without one fall back to first-seen arrival order. This is robust to OTel
  // delivering a trace's spans out of order across batches.
  const ordered = [...nodes.values()].sort((a, b) => {
    const aHas = Number.isFinite(a.startNano);
    const bHas = Number.isFinite(b.startNano);
    if (aHas && bHas) return a.startNano - b.startNano || a.firstSeen - b.firstSeen;
    if (aHas) return -1;
    if (bHas) return 1;
    return a.firstSeen - b.firstSeen;
  });
  ordered.forEach((node, i) => {
    node.order = i + 1;
  });

  const edges: ClassEdge[] = [...edgeKeys].map((key) => {
    const [source, target] = key.split("__");
    return {
      id: `trace-edge-${key}`,
      source,
      target,
      firstSeen: edgeFirstSeen[key],
      methods: edgeMethods.get(key) ?? [],
      count: edgeCount.get(key) ?? 1,
      bidirectional: edgeKeys.has(`${target}__${source}`),
    };
  });

  return {
    nodes: [...nodes.values()],
    edges,
    rootClassName,
    classFirstSeen,
    edgeFirstSeen,
  };
}
