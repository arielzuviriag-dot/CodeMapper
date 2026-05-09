"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Marco Polo "Bitácora" — single navigation tree that records the user's
 * jumps between focus classes/methods during a Marco Polo (FOCO) session.
 *
 * Data model:
 *  • One UNIQUE node per class. Re-visiting a class doesn't create a
 *    duplicate node, only a new edge.
 *  • Edges represent individual jumps. Multiple edges between the same
 *    two nodes are allowed (and visualized as parallel curves).
 *  • The origin node is whatever was the FIRST focused class of the
 *    current Marco Polo session — it never moves.
 *
 * Persistence: sessionStorage. The bitácora survives /map/X → /map/Y
 * client-side navigations (so jumps via "Foco Scaner" don't lose context)
 * but disappears when the tab closes. Future iteration moves to DB and
 * adds a session-history listing.
 */

export interface BitacoraNode {
  /** Stable id — equals className. Drives dedup. */
  id: string;
  className: string;
  /** True only for the very first node of the current bitácora. */
  isOrigen: boolean;
}

export interface BitacoraEdge {
  /** Stable per-jump id (e.g. "edge-{timestamp}-{seq}"). */
  id: string;
  /** Source node id (= className the user jumped FROM). */
  source: string;
  /** Target node id (= className the user jumped TO). */
  target: string;
  /** Method on the source side that triggered the jump (null if direct). */
  fromMethod: string | null;
  /** Method on the target side the user landed on (null for class-foco). */
  toMethod: string | null;
  /** Wall-clock ms — used to order parallel edges between the same pair. */
  timestamp: number;
  /** True for the most-recently registered jump. Drives the "live" stroke
   *  saturation in BitacoraEdge. Reset to false on any new addJump. */
  isLatest: boolean;
}

/**
 * Snapshot of a finished Marco Polo session. Created when the user starts
 * a new analysis from the home page — the previous live tree is frozen
 * here before reset wipes it. Read-only after archiving.
 */
export interface ArchivedTree {
  id: string;
  origenId: string;
  nodes: BitacoraNode[];
  edges: BitacoraEdge[];
  startedAt: number;
  endedAt: number;
}

interface BitacoraState {
  origenId: string | null;
  nodes: BitacoraNode[];
  edges: BitacoraEdge[];
  /** Class name of the node the user is currently parked on. */
  activeNodeId: string | null;
  isPanelOpen: boolean;
  /** ms timestamp when the current live tree's origen was set. Used to
   *  populate startedAt when archiving. */
  startedAt: number | null;
  /** Past trees, oldest first. Each one is a frozen snapshot. */
  archived: ArchivedTree[];
  /** When non-null, the panel renders THIS archived tree instead of the
   *  live one. Read-only mode — clicking nodes/edges shows a toast. */
  viewingArchivedId: string | null;

  /** Sets the origin of the current bitácora. Called once at the very first
   *  focus_class_loaded of a new Marco Polo session. No-op if the bitácora
   *  already has an origen (so a SSE replay doesn't reset it). */
  setOrigen: (className: string) => void;
  /** Records one jump. Creates the target node if missing, marks all
   *  previous edges as not-latest, pushes a new edge with isLatest=true,
   *  and updates activeNodeId to the target. */
  addJump: (params: {
    fromClass: string;
    fromMethod: string | null;
    toClass: string;
    toMethod: string | null;
  }) => void;
  /** Just moves the "active" pointer without registering a jump. Used when
   *  the user clicks a node in the panel to reload the main graph at that
   *  class — they're not jumping, they're navigating back. */
  setActive: (className: string) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  /** Wipes the LIVE tree, archiving it first if it had any content.
   *  Called when the user starts a brand-new analysis from the home page
   *  (NOT during in-session navigation). The archived list is preserved. */
  reset: () => void;
  /** Open the panel viewing this archived tree (read-only). */
  viewArchived: (id: string) => void;
  /** Stop viewing an archived tree, return panel to the live one. */
  closeArchivedView: () => void;
  /** Permanently remove one archived tree from the list. */
  deleteArchived: (id: string) => void;
}

let edgeSeq = 0;
function nextEdgeId(): string {
  edgeSeq += 1;
  return `bedge-${Date.now()}-${edgeSeq}`;
}

export const useBitacoraStore = create<BitacoraState>()(
  persist(
    (set, get) => ({
      origenId: null,
      nodes: [],
      edges: [],
      activeNodeId: null,
      isPanelOpen: false,
      startedAt: null,
      archived: [],
      viewingArchivedId: null,

      setOrigen: (className) => {
        const state = get();
        // No-op if origen is already set — protects against the SSE
        // re-emitting focus_class_loaded on hot reload / strict mode.
        if (state.origenId !== null) return;
        set({
          origenId: className,
          nodes: [{ id: className, className, isOrigen: true }],
          edges: [],
          activeNodeId: className,
          startedAt: Date.now(),
        });
      },

      addJump: ({ fromClass, fromMethod, toClass, toMethod }) => {
        set((state) => {
          // Ensure target node exists.
          const hasTarget = state.nodes.some((n) => n.id === toClass);
          const nextNodes = hasTarget
            ? state.nodes
            : [
                ...state.nodes,
                { id: toClass, className: toClass, isOrigen: false },
              ];
          // Mark all existing edges as not-latest, then push the new one
          // as latest.
          const demoted = state.edges.map((e) =>
            e.isLatest ? { ...e, isLatest: false } : e,
          );
          const nextEdges: BitacoraEdge[] = [
            ...demoted,
            {
              id: nextEdgeId(),
              source: fromClass,
              target: toClass,
              fromMethod,
              toMethod,
              timestamp: Date.now(),
              isLatest: true,
            },
          ];
          return {
            nodes: nextNodes,
            edges: nextEdges,
            activeNodeId: toClass,
          };
        });
      },

      setActive: (className) => set({ activeNodeId: className }),
      togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
      setPanelOpen: (open) => set({ isPanelOpen: open }),
      reset: () => {
        set((state) => {
          // Snapshot the live tree before wiping, but only when it has
          // actual content (an origen + at least one node — otherwise we'd
          // accumulate empty husks every time the user navigates).
          const shouldArchive =
            state.origenId !== null && state.nodes.length > 0;
          const nextArchived = shouldArchive
            ? [
                ...state.archived,
                {
                  id: `tree-${Date.now()}`,
                  origenId: state.origenId as string,
                  nodes: state.nodes,
                  edges: state.edges,
                  startedAt: state.startedAt ?? Date.now(),
                  endedAt: Date.now(),
                },
              ]
            : state.archived;
          return {
            origenId: null,
            nodes: [],
            edges: [],
            activeNodeId: null,
            isPanelOpen: false,
            startedAt: null,
            archived: nextArchived,
            viewingArchivedId: null,
          };
        });
      },
      viewArchived: (id) =>
        set({ viewingArchivedId: id, isPanelOpen: true }),
      closeArchivedView: () => set({ viewingArchivedId: null }),
      deleteArchived: (id) =>
        set((state) => ({
          archived: state.archived.filter((t) => t.id !== id),
          viewingArchivedId:
            state.viewingArchivedId === id ? null : state.viewingArchivedId,
        })),
    }),
    {
      name: "cm-bitacora",
      // sessionStorage so the bitácora survives in-app navigations but
      // dies with the tab. Future iteration: server-side persistence.
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? // Defensive stub for SSR — never actually used because the
            // store is "use client" and consumers only read it client-side.
            ({
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            })
          : window.sessionStorage,
      ),
      // isPanelOpen and viewingArchivedId are UI state — don't persist
      // them, otherwise the panel pops open every time the user reloads
      // the tab on the same archived view.
      partialize: (state) => ({
        origenId: state.origenId,
        nodes: state.nodes,
        edges: state.edges,
        activeNodeId: state.activeNodeId,
        startedAt: state.startedAt,
        archived: state.archived,
      }),
    },
  ),
);
