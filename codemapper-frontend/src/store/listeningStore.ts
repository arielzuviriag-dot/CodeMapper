"use client";

import { create } from "zustand";
import {
  buildTraceGraph,
  type ClassEdge,
  type ClassNode,
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

  /** Substring filter on the request URL — only traces of a matching URL are
   *  drawn. Empty = draw everything. Set by the user before they navigate. */
  urlFilter: string;

  /** Node-type filter: show both, only HTTP entries ("web"), or only Java
   *  classes ("java"). Persists across start/stop/reset (it's a preference). */
  view: TraceView;

  start: () => void;
  stop: () => void;
  clearGraph: () => void;
  setUrlFilter: (filter: string) => void;
  setView: (view: TraceView) => void;
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
  urlFilter: "",
};

export const useListeningStore = create<ListeningState>((set, get) => ({
  phase: "initial",
  // view is intentionally OUTSIDE EMPTY so it survives start/stop/clearGraph —
  // it's a viewing preference, not part of the per-session graph data.
  view: "all" as TraceView,
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

  selectError: (className) => set({ selectedErrorClass: className }),

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
