"use client";

import { create } from "zustand";
import {
  buildTraceGraph,
  type ClassEdge,
  type ClassNode,
  type ScreenLink,
  type TraceSpan,
  type TraceView,
} from "@/lib/trace";

/**
 * "Escuchando" mode store — live execution graph fed by the OTLP trace SSE
 * stream. Kept entirely separate from {@link useGraphStore} so the general /
 * Foco modes are untouched.
 *
 * The raw spans accumulate in {@code spansById}; the derived class graph
 * (nodes/edges/root) is rebuilt from scratch on every ingest. That rebuild is
 * cheap for a single execution trace and removes all the out-of-order / orphan
 * handling that incremental updates would need (see {@link buildTraceGraph}).
 */

export type ListeningPhase = "initial" | "listening";

interface ListeningState {
  /** "initial" = resting (waves + Iniciar). "listening" = SSE open. */
  phase: ListeningPhase;
  /** True once at least one class node exists (the "drawing" sub-state). */
  hasGraph: boolean;

  spansById: Record<string, TraceSpan>;
  nodes: ClassNode[];
  edges: ClassEdge[];
  rootClassName: string | null;
  classFirstSeen: Record<string, number>;
  edgeFirstSeen: Record<string, number>;

  /** className whose error panel is open, or null. */
  selectedErrorClass: string | null;

  /** className selected from the order panel / a node click — highlights it in
   *  the graph and drives the detail shown in the panel. */
  highlight: string | null;

  /** Substring filter on the request URL — only traces of a matching URL are
   *  drawn. Empty = draw everything. Set by the user before they navigate. */
  urlFilter: string;

  /** Node-type filter: show both, only HTTP entries ("web"), or only Java
   *  classes ("java"). Persists across start/stop/reset (it's a preference). */
  view: TraceView;

  /** Front-end screens (verb/path/screen/mobile) from a front scan — used to
   *  inject "which screen triggered this" into the live graph. */
  screenIndex: ScreenLink[];

  /** Optional backend project root — lets the panel resolve a class's source
   *  by fqcn so clicking shows its code. Persists across reset. */
  backendPath: string;

  /** Source-code viewer payload (or null = closed). */
  sourceView: { title: string; source: string; path: string } | null;

  start: () => void;
  stop: () => void;
  clearGraph: () => void;
  setUrlFilter: (filter: string) => void;
  setView: (view: TraceView) => void;
  setScreenIndex: (screens: ScreenLink[]) => void;
  setHighlight: (className: string | null) => void;
  setBackendPath: (path: string) => void;
  openSource: (v: { title: string; source: string; path: string }) => void;
  closeSource: () => void;
  ingest: (spans: TraceSpan[]) => void;
  selectError: (className: string | null) => void;
  reset: () => void;
}

const EMPTY = {
  spansById: {} as Record<string, TraceSpan>,
  nodes: [] as ClassNode[],
  edges: [] as ClassEdge[],
  rootClassName: null as string | null,
  classFirstSeen: {} as Record<string, number>,
  edgeFirstSeen: {} as Record<string, number>,
  hasGraph: false,
  selectedErrorClass: null as string | null,
  highlight: null as string | null,
  sourceView: null as { title: string; source: string; path: string } | null,
  urlFilter: "",
};

export const useListeningStore = create<ListeningState>((set, get) => ({
  phase: "initial",
  // view is intentionally OUTSIDE EMPTY so it survives start/stop/clearGraph —
  // it's a viewing preference, not part of the per-session graph data.
  view: "all" as TraceView,
  // Also outside EMPTY — the front scan + backend path survive reset/clear.
  screenIndex: [] as ScreenLink[],
  backendPath: "",
  ...EMPTY,

  start: () => set({ phase: "listening", ...EMPTY }),

  stop: () => set({ phase: "initial", ...EMPTY }),

  reset: () => set({ phase: "initial", ...EMPTY }),

  // Wipe the drawn graph but KEEP listening: the SSE stays open (phase stays
  // "listening") and the URL filter is preserved. hasGraph flips to false so
  // the screen falls back to the black waves; the next spans that arrive
  // rebuild the graph from scratch. This is the "borrar y seguir escuchando"
  // button — distinct from stop(), which closes the stream and goes to inicial.
  clearGraph: () => {
    const { urlFilter } = get();
    set({ ...EMPTY, phase: "listening", urlFilter });
  },

  // Set the URL filter and re-scope the graph to it. We DON'T fire any
  // request — the user navigates their app themselves (another tab/browser);
  // whatever they hit that matches this filter gets drawn. Rebuilds from the
  // spans already seen so a matching trace that arrived early shows at once.
  setUrlFilter: (filter) => {
    const state = get();
    const graph = buildTraceGraph(
      state.spansById,
      state.classFirstSeen,
      state.edgeFirstSeen,
      Date.now(),
      filter,
      state.view,
      state.screenIndex,
    );
    set({
      urlFilter: filter,
      nodes: graph.nodes,
      edges: graph.edges,
      rootClassName: graph.rootClassName,
      classFirstSeen: graph.classFirstSeen,
      edgeFirstSeen: graph.edgeFirstSeen,
      hasGraph: graph.nodes.length > 0,
      selectedErrorClass: null,
    });
  },

  // Switch the node-type view (all / web / java) and re-scope the already-seen
  // spans to it. Like setUrlFilter, this fires no request — it just rebuilds
  // the graph from the accumulated spans through the new view.
  setView: (view) => {
    const state = get();
    const graph = buildTraceGraph(
      state.spansById,
      state.classFirstSeen,
      state.edgeFirstSeen,
      Date.now(),
      state.urlFilter,
      view,
      state.screenIndex,
    );
    set({
      view,
      nodes: graph.nodes,
      edges: graph.edges,
      rootClassName: graph.rootClassName,
      classFirstSeen: graph.classFirstSeen,
      edgeFirstSeen: graph.edgeFirstSeen,
      hasGraph: graph.nodes.length > 0,
      selectedErrorClass: null,
    });
  },

  // Set the front-screen index (from a front scan) and re-inject the matching
  // screen nodes into the current graph.
  setScreenIndex: (screens) => {
    const state = get();
    const graph = buildTraceGraph(
      state.spansById,
      state.classFirstSeen,
      state.edgeFirstSeen,
      Date.now(),
      state.urlFilter,
      state.view,
      screens,
    );
    set({
      screenIndex: screens,
      nodes: graph.nodes,
      edges: graph.edges,
      rootClassName: graph.rootClassName,
      classFirstSeen: graph.classFirstSeen,
      edgeFirstSeen: graph.edgeFirstSeen,
      hasGraph: graph.nodes.length > 0,
    });
  },

  selectError: (className) => set({ selectedErrorClass: className }),

  setHighlight: (className) => set({ highlight: className }),

  setBackendPath: (path) => set({ backendPath: path }),
  openSource: (v) => set({ sourceView: v }),
  closeSource: () => set({ sourceView: null }),

  ingest: (spans) => {
    if (spans.length === 0) return;
    const state = get();
    const spansById = { ...state.spansById };
    for (const span of spans) {
      if (span?.spanId) spansById[span.spanId] = span;
    }
    // Date.now() is fine here — this runs on the client at ingest time, never
    // during SSR or replay.
    const graph = buildTraceGraph(
      spansById,
      state.classFirstSeen,
      state.edgeFirstSeen,
      Date.now(),
      state.urlFilter,
      state.view,
      state.screenIndex,
    );
    set({
      spansById,
      nodes: graph.nodes,
      edges: graph.edges,
      rootClassName: graph.rootClassName,
      classFirstSeen: graph.classFirstSeen,
      edgeFirstSeen: graph.edgeFirstSeen,
      hasGraph: graph.nodes.length > 0,
    });
  },
}));
