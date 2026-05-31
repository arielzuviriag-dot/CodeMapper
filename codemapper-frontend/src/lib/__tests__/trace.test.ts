import { describe, it, expect } from "vitest";
import { buildTraceGraph, type TraceSpan } from "@/lib/trace";

function span(p: Partial<TraceSpan> & { spanId: string }): TraceSpan {
  return {
    traceId: "t1",
    parentSpanId: null,
    fqcn: null,
    className: null,
    method: null,
    spanName: null,
    httpUrl: null,
    status: "OK",
    startUnixNano: 0,
    durationMs: 1,
    error: null,
    ...p,
  };
}

function byId(spans: TraceSpan[]): Record<string, TraceSpan> {
  return Object.fromEntries(spans.map((s) => [s.spanId, s]));
}

describe("buildTraceGraph", () => {
  it("builds a class node per unique class and dedups repeat calls", () => {
    const g = buildTraceGraph(
      byId([
        span({ spanId: "1", className: "A", fqcn: "com.A", method: "handle" }),
        span({ spanId: "2", parentSpanId: "1", className: "B", method: "save" }),
        span({ spanId: "3", parentSpanId: "1", className: "B", method: "find" }),
      ]),
      {},
      {},
      1000,
    );

    expect(g.nodes).toHaveLength(2);
    const b = g.nodes.find((n) => n.className === "B")!;
    expect(b.methods.sort()).toEqual(["find", "save"]);
    expect(b.hitCount).toBe(2);
    expect(g.rootClassName).toBe("A");
    expect(g.edges.map((e) => e.id)).toEqual(["trace-edge-A__B"]);
  });

  it("bridges through spans without a class (framework/DB spans)", () => {
    // A → (framework, no class) → B  must yield a direct A → B edge.
    const g = buildTraceGraph(
      byId([
        span({ spanId: "1", className: "A", method: "handle" }),
        span({ spanId: "2", parentSpanId: "1", spanName: "GET /x" }), // no class
        span({ spanId: "3", parentSpanId: "2", className: "B", method: "go" }),
      ]),
      {},
      {},
      1000,
    );

    expect(g.nodes.map((n) => n.className).sort()).toEqual(["A", "B"]);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].source).toBe("A");
    expect(g.edges[0].target).toBe("B");
  });

  it("assigns concentric depth by call distance from the root", () => {
    const g = buildTraceGraph(
      byId([
        span({ spanId: "1", className: "A" }),
        span({ spanId: "2", parentSpanId: "1", className: "B" }),
        span({ spanId: "3", parentSpanId: "2", className: "C" }),
      ]),
      {},
      {},
      1000,
    );
    const depth = Object.fromEntries(g.nodes.map((n) => [n.className, n.depth]));
    expect(depth).toEqual({ A: 0, B: 1, C: 2 });
  });

  it("numbers classes by execution (span start) order, not arrival order", () => {
    // C's span has the EARLIEST start time but is listed last → it must still
    // get order 1. B starts after A. This proves we sort by start time, not by
    // insertion/arrival order.
    const g = buildTraceGraph(
      byId([
        span({ spanId: "1", className: "A", startUnixNano: 200 }),
        span({ spanId: "2", className: "B", startUnixNano: 300 }),
        span({ spanId: "3", className: "C", startUnixNano: 100 }),
      ]),
      {},
      {},
      1000,
    );
    const order = Object.fromEntries(g.nodes.map((n) => [n.className, n.order]));
    expect(order).toEqual({ C: 1, A: 2, B: 3 });
  });

  it("marks a class ERROR (sticky) and keeps the exception detail", () => {
    const g = buildTraceGraph(
      byId([
        span({ spanId: "1", className: "A" }),
        span({
          spanId: "2",
          parentSpanId: "1",
          className: "B",
          status: "ERROR",
          error: { type: "NPE", message: "boom", stacktrace: "at B" },
        }),
        span({ spanId: "3", parentSpanId: "1", className: "B", status: "OK" }),
      ]),
      {},
      {},
      1000,
    );
    const b = g.nodes.find((n) => n.className === "B")!;
    expect(b.status).toBe("ERROR");
    expect(b.error?.type).toBe("NPE");
  });

  it("handles out-of-order arrival (child before parent)", () => {
    // Child span arrives first; parent later. Rebuild must still link them.
    const g = buildTraceGraph(
      byId([
        span({ spanId: "2", parentSpanId: "1", className: "B" }),
        span({ spanId: "1", className: "A" }),
      ]),
      {},
      {},
      1000,
    );
    expect(g.rootClassName).toBe("A");
    expect(g.edges[0]?.source).toBe("A");
    expect(g.edges[0]?.target).toBe("B");
  });

  it("filters the graph to traces matching the URL filter", () => {
    // Two traces: t1 hits /login, t2 hits /checkout. Filtering by "/checkout"
    // must keep only t2's classes.
    const g = buildTraceGraph(
      byId([
        span({ spanId: "1", traceId: "t1", spanName: "GET /login", httpUrl: "localhost:8085/login" }),
        span({ spanId: "2", traceId: "t1", parentSpanId: "1", className: "LoginController" }),
        span({ spanId: "3", traceId: "t2", spanName: "GET /checkout", httpUrl: "localhost:8085/checkout" }),
        span({ spanId: "4", traceId: "t2", parentSpanId: "3", className: "OrderController" }),
      ]),
      {},
      {},
      1000,
      "/checkout",
    );
    // The HTTP entry ("GET /checkout") shows as a node too, plus the class.
    expect(g.nodes.map((n) => n.className).sort()).toEqual([
      "GET /checkout",
      "OrderController",
    ]);
    expect(g.nodes.find((n) => n.className === "GET /checkout")?.isHttp).toBe(true);
    expect(g.nodes.find((n) => n.className === "OrderController")?.isHttp).toBe(false);
  });

  it("matches a full base URL (scheme + trailing slash) against all its paths", () => {
    const g = buildTraceGraph(
      byId([
        span({ spanId: "1", traceId: "t1", httpUrl: "localhost:8085/login" }),
        span({ spanId: "2", traceId: "t1", parentSpanId: "1", className: "LoginController" }),
        span({ spanId: "3", traceId: "t2", httpUrl: "otherhost:9000/x" }),
        span({ spanId: "4", traceId: "t2", parentSpanId: "3", className: "Other" }),
      ]),
      {},
      {},
      1000,
      "http://localhost:8085/", // full URL with scheme + trailing slash
    );
    // Only t1 (localhost:8085) matches; t2 (otherhost) is excluded.
    expect(g.nodes.map((n) => n.className).sort()).toEqual([
      "LoginController",
      "localhost:8085/login",
    ]);
  });

  it("shows an HTTP-entry node even when the request never reached a class", () => {
    // A 401 that stops at security: only a server span, no className. We must
    // still draw it (so the user sees the call happened) instead of nothing.
    const g = buildTraceGraph(
      byId([
        span({
          spanId: "1",
          traceId: "t1",
          spanName: "GET /api/users",
          httpUrl: "localhost:4020/api/users",
        }),
      ]),
      {},
      {},
      1000,
    );
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].className).toBe("GET /api/users");
    expect(g.nodes[0].isHttp).toBe(true);
    expect(g.rootClassName).toBe("GET /api/users");
  });

  it("view 'web' shows only the HTTP entries, not the Java classes", () => {
    const spans = byId([
      span({ spanId: "1", spanName: "GET /api/x", httpUrl: "localhost:5180/api/x" }),
      span({ spanId: "2", parentSpanId: "1", className: "Controller" }),
      span({ spanId: "3", parentSpanId: "2", className: "Service" }),
    ]);
    const g = buildTraceGraph(spans, {}, {}, 1000, "", "web");
    expect(g.nodes.map((n) => n.className)).toEqual(["GET /api/x"]);
    expect(g.nodes[0].isHttp).toBe(true);
    expect(g.edges).toHaveLength(0); // a lone HTTP entry has no children to link
  });

  it("view 'java' shows only classes and bridges through the HTTP entry", () => {
    const spans = byId([
      span({ spanId: "1", spanName: "GET /api/x", httpUrl: "localhost:5180/api/x" }),
      span({ spanId: "2", parentSpanId: "1", className: "Controller" }),
      span({ spanId: "3", parentSpanId: "2", className: "Service" }),
    ]);
    const g = buildTraceGraph(spans, {}, {}, 1000, "", "java");
    expect(g.nodes.map((n) => n.className).sort()).toEqual(["Controller", "Service"]);
    expect(g.nodes.every((n) => !n.isHttp)).toBe(true);
    // Controller (whose real parent is the hidden HTTP entry) becomes the root;
    // the Controller → Service edge survives.
    expect(g.rootClassName).toBe("Controller");
    expect(g.edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      "Controller->Service",
    ]);
  });

  it("view 'all' (default) keeps both HTTP entries and classes", () => {
    const spans = byId([
      span({ spanId: "1", spanName: "GET /api/x", httpUrl: "localhost:5180/api/x" }),
      span({ spanId: "2", parentSpanId: "1", className: "Controller" }),
    ]);
    const g = buildTraceGraph(spans, {}, {}, 1000, "", "all");
    expect(g.nodes.map((n) => n.className).sort()).toEqual([
      "Controller",
      "GET /api/x",
    ]);
  });

  it("reconstructs the real plixe GET /api/admin/users trace faithfully", () => {
    // Ground truth from the live capture + AdminUsersController.list source:
    //   SERVER GET /api/admin/users
    //     ├─ JwtService.parse                 (security filter)
    //     ├─ JwtDenylistRepository.existsById (security filter)
    //     └─ AdminUsersController.list
    //          └─ UserRepository.findAll
    //               └─ SELECT users   (DB CLIENT span, NO className → must bridge)
    // CodeMapper must: draw the 4 classes + the HTTP entry, bridge the DB span
    // (so UserRepository's parent is UserRepository's caller, not the DB span),
    // order by execution start, and never drop a class that ran.
    const g = buildTraceGraph(
      byId([
        span({ spanId: "S", traceId: "t", spanName: "GET /api/admin/users", httpUrl: "localhost:5180/api/admin/users", startUnixNano: 100 }),
        span({ spanId: "J", traceId: "t", parentSpanId: "S", className: "JwtService", fqcn: "com.plixe.security.JwtService", method: "parse", startUnixNano: 110 }),
        span({ spanId: "D", traceId: "t", parentSpanId: "S", className: "JwtDenylistRepository", fqcn: "com.plixe.auth.JwtDenylistRepository", method: "existsById", startUnixNano: 120 }),
        span({ spanId: "C", traceId: "t", parentSpanId: "S", className: "AdminUsersController", fqcn: "com.plixe.admin.AdminUsersController", method: "list", startUnixNano: 130 }),
        span({ spanId: "R", traceId: "t", parentSpanId: "C", className: "UserRepository", fqcn: "com.plixe.user.UserRepository", method: "findAll", startUnixNano: 140 }),
        span({ spanId: "DB", traceId: "t", parentSpanId: "R", spanName: "SELECT users", startUnixNano: 145 }), // no className
      ]),
      {},
      {},
      1000,
    );

    // Completeness: every class that ran is a node, plus the HTTP entry. The DB
    // span is NOT a node (correctly — it's a DB call, not a Java class).
    expect(g.nodes.map((n) => n.className).sort()).toEqual([
      "AdminUsersController",
      "GET /api/admin/users",
      "JwtDenylistRepository",
      "JwtService",
      "UserRepository",
    ]);
    // Bridging: UserRepository's parent is its CALLER (AdminUsersController),
    // reached by walking THROUGH the un-nodal DB span's sibling chain — i.e. the
    // DB span never becomes a phantom parent.
    const edges = g.edges.map((e) => `${e.source}->${e.target}`).sort();
    expect(edges).toEqual([
      "AdminUsersController->UserRepository",
      "GET /api/admin/users->AdminUsersController",
      "GET /api/admin/users->JwtDenylistRepository",
      "GET /api/admin/users->JwtService",
    ]);
    // Root + execution order match what the PDF showed (1→5 by start time).
    expect(g.rootClassName).toBe("GET /api/admin/users");
    const order = Object.fromEntries(g.nodes.map((n) => [n.className, n.order]));
    expect(order).toEqual({
      "GET /api/admin/users": 1,
      JwtService: 2,
      JwtDenylistRepository: 3,
      AdminUsersController: 4,
      UserRepository: 5,
    });
  });

  it("counts repeat calls (hitCount) when a trace runs twice", () => {
    // The real screen fired GET /api/admin/users twice → every class ran 2×.
    // CodeMapper must merge them into one node each with hitCount 2, not duplicate.
    const mk = (suffix: string, start: number) => [
      span({ spanId: `C${suffix}`, traceId: `t${suffix}`, className: "AdminUsersController", method: "list", startUnixNano: start }),
      span({ spanId: `R${suffix}`, traceId: `t${suffix}`, parentSpanId: `C${suffix}`, className: "UserRepository", method: "findAll", startUnixNano: start + 5 }),
    ];
    const g = buildTraceGraph(byId([...mk("1", 100), ...mk("2", 200)]), {}, {}, 1000);
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes.find((n) => n.className === "AdminUsersController")?.hitCount).toBe(2);
    expect(g.nodes.find((n) => n.className === "UserRepository")?.hitCount).toBe(2);
  });

  it("injects the front-end screen that triggered an HTTP entry", () => {
    // Live trace: POST /api/daily/start hits AdminController; the screen index
    // (from a front scan) says daily.tsx (mobile) calls /api/daily/start.
    const g = buildTraceGraph(
      byId([
        span({ spanId: "S", traceId: "t", spanName: "POST /api/daily/start", httpUrl: "localhost:5180/api/daily/start" }),
        span({ spanId: "C", traceId: "t", parentSpanId: "S", className: "DailyController", method: "start" }),
      ]),
      {},
      {},
      1000,
      "",
      "all",
      [{ verb: "POST", path: "/api/daily/start", screen: "daily.tsx", mobile: true }],
    );

    const screen = g.nodes.find((n) => n.isScreen);
    expect(screen).toBeTruthy();
    expect(screen!.className).toBe("daily.tsx");
    expect(screen!.screenKind).toBe("mobile");
    // Arrow goes screen → HTTP entry.
    expect(
      g.edges.some(
        (e) => e.source === "screen:daily.tsx" && e.target === "POST /api/daily/start",
      ),
    ).toBe(true);
  });

  it("preserves firstSeen stamps across rebuilds", () => {
    const first = buildTraceGraph(
      byId([span({ spanId: "1", className: "A" })]),
      {},
      {},
      1000,
    );
    const second = buildTraceGraph(
      byId([
        span({ spanId: "1", className: "A" }),
        span({ spanId: "2", parentSpanId: "1", className: "B" }),
      ]),
      first.classFirstSeen,
      first.edgeFirstSeen,
      2000,
    );
    expect(second.classFirstSeen.A).toBe(1000); // unchanged
    expect(second.classFirstSeen.B).toBe(2000); // new
  });
});
