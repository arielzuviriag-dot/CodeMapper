"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import { ArrowLeft, Clock, Download, GripHorizontal, History, X } from "lucide-react";
import { toast } from "sonner";
import { useBitacoraStore } from "@/store/bitacoraStore";
import { BitacoraNode } from "./BitacoraNode";
import { BitacoraEdge } from "./BitacoraEdge";

const NODE_TYPES = { bitacoraNode: BitacoraNode };
const EDGE_TYPES = { bitacoraEdge: BitacoraEdge };

const DEFAULT_W = 500;
const DEFAULT_H = 500;
const MIN_W = 360;
const MIN_H = 320;

/** Radial layout — origin at (0,0), other nodes evenly spaced around. */
const ORIGIN_RADIUS = 0;
const RING_RADIUS = 170;

/**
 * Bitácora panel — a draggable, resizable, non-blocking modal that hosts
 * a small React Flow showing the user's navigation tree. The origin node
 * stays at the center; visited nodes orbit. Edges register every jump
 * the user has made via "Foco Scaner" / "Foco al Método" since the
 * current Marco Polo session began.
 *
 * The panel mounts once the bitácora has at least the origin AND the
 * user has toggled it open via BitacoraIndicator. Closing the panel
 * (X or click outside the chrome) only hides — the bitácora data
 * survives so reopening shows the same tree intact.
 */
export function Bitacora() {
  const isPanelOpen = useBitacoraStore((s) => s.isPanelOpen);
  const setPanelOpen = useBitacoraStore((s) => s.setPanelOpen);
  if (!isPanelOpen) return null;
  return (
    <ReactFlowProvider>
      <BitacoraInner onClose={() => setPanelOpen(false)} />
    </ReactFlowProvider>
  );
}

function BitacoraInner({ onClose }: { onClose: () => void }) {
  // The panel always reads the live tree from the store, but if
  // viewingArchivedId is set we swap to the matching archived snapshot.
  // That keeps the Bitacora component a single source of truth.
  const liveNodes = useBitacoraStore((s) => s.nodes);
  const liveEdges = useBitacoraStore((s) => s.edges);
  const liveActiveNodeId = useBitacoraStore((s) => s.activeNodeId);
  const liveOrigenId = useBitacoraStore((s) => s.origenId);
  const viewingArchivedId = useBitacoraStore((s) => s.viewingArchivedId);
  const archived = useBitacoraStore((s) => s.archived);
  const closeArchivedView = useBitacoraStore((s) => s.closeArchivedView);

  const archivedTree = viewingArchivedId
    ? archived.find((t) => t.id === viewingArchivedId) ?? null
    : null;
  const isHistorical = archivedTree !== null;
  const nodes = archivedTree ? archivedTree.nodes : liveNodes;
  const edges = archivedTree ? archivedTree.edges : liveEdges;
  // No "active" highlight in historical mode — it isn't meaningful for a
  // frozen snapshot. Live mode keeps tracking the user's last position.
  const activeNodeId = archivedTree ? null : liveActiveNodeId;
  const origenId = archivedTree ? archivedTree.origenId : liveOrigenId;

  // Drag state — track delta from initial pointer down. We avoid
  // react-draggable to keep zero new deps; manual pointer handling is ~20
  // lines and reuses the existing bg/border tokens.
  const [pos, setPos] = useState({
    x: typeof window !== "undefined" ? window.innerWidth - DEFAULT_W - 24 : 24,
    y: 96,
  });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest("[data-drag-handle]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: pos.x,
      baseY: pos.y,
    };
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: Math.max(0, dragRef.current.baseX + dx),
      y: Math.max(0, dragRef.current.baseY + dy),
    });
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  // Build React Flow nodes + edges from the store. Layout: origen at
  // (0,0), visited nodes evenly spaced on a ring of RING_RADIUS. As N
  // grows the ring gets crowded — leave that for a v2 (multi-ring).
  const { rfNodes, rfEdges } = useMemo(() => {
    const others = nodes.filter((n) => !n.isOrigen);
    const N = Math.max(others.length, 1);
    const rfNodes: Node[] = [];

    const origen = nodes.find((n) => n.isOrigen);
    if (origen) {
      rfNodes.push({
        id: origen.id,
        type: "bitacoraNode",
        position: { x: -32, y: -32 }, // half of 65px-ish so it sits centered
        data: {
          className: origen.className,
          isOrigen: true,
          isActive: origen.id === activeNodeId,
        },
        draggable: false,
        selectable: false,
      });
    }

    others.forEach((n, i) => {
      const angle = -Math.PI / 2 + (i / N) * 2 * Math.PI;
      const cx = ORIGIN_RADIUS + RING_RADIUS * Math.cos(angle);
      const cy = ORIGIN_RADIUS + RING_RADIUS * Math.sin(angle);
      rfNodes.push({
        id: n.id,
        type: "bitacoraNode",
        position: { x: cx - 19, y: cy - 19 }, // 38/2
        data: {
          className: n.className,
          isOrigen: false,
          isActive: n.id === activeNodeId,
        },
        draggable: false,
        selectable: false,
      });
    });

    // For each source/target pair, count how many edges share it so the
    // edge component knows its parallel index and can offset its curve.
    const pairKey = (s: string, t: string) => `${s}→${t}`;
    const totalsByPair = new Map<string, number>();
    const indexByPair = new Map<string, number>();
    for (const e of edges) {
      totalsByPair.set(
        pairKey(e.source, e.target),
        (totalsByPair.get(pairKey(e.source, e.target)) ?? 0) + 1,
      );
    }

    const rfEdges: Edge[] = edges.map((e) => {
      const key = pairKey(e.source, e.target);
      const idx = indexByPair.get(key) ?? 0;
      indexByPair.set(key, idx + 1);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "bitacoraEdge",
        data: {
          fromMethod: e.fromMethod,
          toMethod: e.toMethod,
          isLatest: e.isLatest,
          parallelIndex: idx,
          parallelCount: totalsByPair.get(key) ?? 1,
          // Click handler: in live mode, move the active marker to the
          // edge's target. In historical mode, show a toast — the
          // archived tree is read-only by design.
          onSelect: () => {
            if (isHistorical) {
              toast.info("Modo histórico — solo lectura");
              return;
            }
            useBitacoraStore.getState().setActive(e.target);
          },
        },
      };
    });

    return { rfNodes, rfEdges };
  }, [nodes, edges, activeNodeId, isHistorical]);

  // Frame the tree on first render and whenever the node count changes.
  const flowRef = useRef<HTMLDivElement | null>(null);
  const { fitView } = useReactFlow();
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      fitView({ duration: 350, padding: 0.18 });
    }, 80);
  }, [fitView, rfNodes.length]);

  const onExport = useCallback(async () => {
    const target = flowRef.current?.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!target) {
      toast.error("No se pudo capturar el árbol");
      return;
    }
    try {
      // Frame the tree before capturing so the PNG includes everything,
      // not just what's visible in the panel viewport.
      fitView({ padding: 0.12, duration: 0 });
      // Wait one paint so React Flow has applied the new transform.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const dataUrl = await toPng(target, {
        backgroundColor: "#0A0A0A",
        pixelRatio: 2,
      });
      const today = new Date().toISOString().slice(0, 10);
      const safeName = (origenId ?? "arbol").replace(/[^A-Za-z0-9._-]/g, "_");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `arbol-${safeName}-${today}.png`;
      link.click();
    } catch (err) {
      console.error("[CodeMapper] bitácora PNG export failed", err);
      toast.error("No se pudo exportar el árbol");
    }
  }, [fitView, origenId]);

  return (
    <div
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: DEFAULT_W,
        height: DEFAULT_H,
        minWidth: MIN_W,
        minHeight: MIN_H,
        resize: "both",
        overflow: "hidden",
        zIndex: 60,
      }}
      className="cm-hairline-top flex flex-col rounded-lg border border-[var(--bordo)]/40 bg-[var(--bg-card)] shadow-[var(--shadow-xl,0_25px_60px_rgba(0,0,0,0.7))]"
      role="dialog"
      aria-label="Árbol de Marco Polo"
    >
      {/* Drag handle / header */}
      <div
        data-drag-handle
        className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-2 active:cursor-grabbing"
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--silver-dark)]" />
          <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
            Árbol
          </span>
          <span className="truncate font-mono text-[10px] tabular-nums text-[var(--silver-mid)]">
            {origenId ? `· origen: ${origenId}` : ""}
          </span>
          {isHistorical && (
            <span className="flex shrink-0 items-center gap-1 rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--bordo)]">
              <History className="h-2.5 w-2.5" />
              Histórico
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isHistorical && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeArchivedView();
              }}
              title="Volver al árbol actual"
              aria-label="Volver al árbol actual"
              className="flex h-6 items-center gap-1 rounded-sm border border-[var(--border-silver)] px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--silver)] transition-colors hover:border-[var(--bordo)] hover:text-[var(--bordo)]"
            >
              <ArrowLeft className="h-3 w-3" />
              Actual
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
            title="Exportar árbol a PNG"
            aria-label="Exportar árbol a PNG"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--silver-dark)] transition-colors hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)]"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Cerrar panel"
            aria-label="Cerrar panel"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--silver-dark)] transition-colors hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* React Flow viewport */}
      <div ref={flowRef} className="relative flex-1 bg-[var(--bg-base)]">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          proOptions={{ hideAttribution: true }}
          minZoom={0.4}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnScroll
          zoomOnPinch
          fitView
          fitViewOptions={{ padding: 0.18 }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1}
            color="rgba(192, 192, 200, 0.07)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
