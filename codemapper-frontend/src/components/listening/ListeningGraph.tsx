"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useListeningStore } from "@/store/listeningStore";
import { useGraphInteraction } from "@/hooks/useGraphInteraction";
import { resolveJavaSource } from "@/lib/api";
import { ListeningNode, type ListeningNodeData } from "./ListeningNode";
import { ListeningEdge } from "./ListeningEdge";

const NODE_TYPES = { listening: ListeningNode };
const EDGE_TYPES = { listening: ListeningEdge };

const CENTER_W = 320;
const CENTER_H = 150;
const PERIPHERAL_W = 220;
const PERIPHERAL_H = 120;

/** Ring radius per BFS depth. Grows so deeper rings have room for more nodes. */
function ringRadius(depth: number): number {
  return depth * 420;
}

/**
 * "Escuchando" graph — concentric rings by call depth. The entry class sits at
 * the origin (where the "Iniciar" button was); each successive ring is one
 * call deeper. Reuses the Foco visual language via {@link ListeningNode} /
 * {@link ListeningEdge} but is driven entirely by the live trace store.
 *
 * Interaction: the canvas pans (drag background) and zooms (wheel / Controls),
 * and each class node can be dragged. The auto-fit that keeps new rings in view
 * backs off the moment the user pans/zooms/drags, so manual positioning is
 * never yanked back by an incoming span.
 */
function ListeningGraphInner() {
  const nodesData = useListeningStore((s) => s.nodes);
  const edgesData = useListeningStore((s) => s.edges);
  const rootClassName = useListeningStore((s) => s.rootClassName);
  const selectError = useListeningStore((s) => s.selectError);
  const highlight = useListeningStore((s) => s.highlight);
  const setHighlight = useListeningStore((s) => s.setHighlight);
  const backendPath = useListeningStore((s) => s.backendPath);
  const openSource = useListeningStore((s) => s.openSource);
  const { fitView } = useReactFlow();

  // Double click → show the object's source code (Java classes, via the
  // backend path). Single click stays as highlight + panel select.
  const showSource = (node: Node) => {
    const cn = (node.data as ListeningNodeData).node;
    setHighlight(node.id);
    if (!cn?.fqcn) return;
    if (!backendPath) {
      toast.message("Agregá la ruta del backend al Iniciar para ver el código");
      return;
    }
    resolveJavaSource(backendPath, cn.fqcn)
      .then((res) => {
        if (res.found && res.source != null) {
          openSource({
            title: cn.className,
            source: res.source,
            path: res.filePath ?? "",
          });
        } else {
          toast.error(`No encontré el archivo de ${cn.className} en el backend`);
        }
      })
      .catch(() => toast.error("No se pudo leer el código"));
  };
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Target layout computed from the store (radial rings by call depth).
  const { nodes: computedNodes, edges: computedEdges } = useMemo<{
    nodes: Node[];
    edges: Edge[];
  }>(() => {
    if (nodesData.length === 0) return { nodes: [], edges: [] };

    // Group classes by depth ring, ordered by firstSeen so the angular slot a
    // class gets is stable as later classes arrive (it keeps its place).
    const byDepth = new Map<number, typeof nodesData>();
    for (const n of nodesData) {
      const arr = byDepth.get(n.depth) ?? [];
      arr.push(n);
      byDepth.set(n.depth, arr);
    }
    byDepth.forEach((arr) => arr.sort((a, b) => a.firstSeen - b.firstSeen));

    const pos = new Map<string, { x: number; y: number }>();
    const outNodes: Node[] = [];

    byDepth.forEach((ring, depth) => {
      if (depth === 0) {
        // The (single) root sits at the origin.
        ring.forEach((n) => {
          pos.set(n.className, { x: 0, y: 0 });
          outNodes.push({
            id: n.className,
            type: "listening",
            position: { x: -CENTER_W / 2, y: -CENTER_H / 2 },
            width: CENTER_W,
            height: CENTER_H,
            data: { node: n, isCenter: true },
            draggable: true,
            selectable: false,
          });
        });
        return;
      }
      const radius = ringRadius(depth);
      const count = ring.length;
      ring.forEach((n, i) => {
        // Offset every other ring by half a slot so nodes don't line up
        // radially across rings (less edge overlap).
        const angle =
          -Math.PI / 2 +
          (i / Math.max(count, 1)) * 2 * Math.PI +
          (depth % 2 === 0 ? Math.PI / Math.max(count, 1) : 0);
        const cx = radius * Math.cos(angle);
        const cy = radius * Math.sin(angle);
        pos.set(n.className, { x: cx, y: cy });
        outNodes.push({
          id: n.className,
          type: "listening",
          position: { x: cx - PERIPHERAL_W / 2, y: cy - PERIPHERAL_H / 2 },
          width: PERIPHERAL_W,
          height: PERIPHERAL_H,
          data: { node: n, isCenter: false },
          draggable: true,
        });
      });
    });

    const outEdges: Edge[] = edgesData.map((e, i) => {
      const targetNode = nodesData.find((n) => n.className === e.target);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "listening",
        data: {
          firstSeen: e.firstSeen,
          index: i,
          isError: targetNode?.status === "ERROR",
          methods: e.methods,
          count: e.count,
          bidirectional: e.bidirectional,
        },
      };
    });

    return { nodes: outNodes, edges: outEdges };
  }, [nodesData, edgesData]);

  // Shared interaction: drag + pan/zoom (auto-fit backs off), single click →
  // open the errored node's stacktrace, double click → highlight connections.
  const {
    nodes: rfNodes,
    edges: rfEdges,
    onNodesChange,
    onEdgesChange,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    onNodeClick,
    shouldAutoFit,
  } = useGraphInteraction(computedNodes, computedEdges, (node) => {
    // Single click → select it (highlights here + drives the order panel).
    setHighlight(node.id);
    const d = node.data as ListeningNodeData;
    if (d?.node?.status === "ERROR") selectError(d.node.className);
  });

  // Apply the store-driven highlight (order panel or a node click): the chosen
  // node + its neighbours grow and glow gold; everything else dims.
  const finalNodes = useMemo<Node[]>(() => {
    if (!highlight) return rfNodes;
    const connected = new Set<string>([highlight]);
    for (const e of rfEdges) {
      if (e.source === highlight) connected.add(e.target);
      if (e.target === highlight) connected.add(e.source);
    }
    return rfNodes.map((n) =>
      connected.has(n.id)
        ? {
            ...n,
            zIndex: 10,
            style: {
              ...(n.style ?? {}),
              scale: "1.2",
              opacity: 1,
              transition: "scale 0.15s ease-out",
            },
          }
        : { ...n, style: { ...(n.style ?? {}), opacity: 0.25 } },
    );
  }, [rfNodes, rfEdges, highlight]);

  const finalEdges = useMemo<Edge[]>(() => {
    if (!highlight) return rfEdges;
    return rfEdges.map((e) => {
      const lit = e.source === highlight || e.target === highlight;
      const base = (e.style ?? {}) as React.CSSProperties;
      return lit
        ? {
            ...e,
            zIndex: 1000,
            style: {
              ...base,
              stroke: "#FFD166",
              strokeWidth: Math.max(Number(base.strokeWidth ?? 2) * 2.5, 4),
              opacity: 1,
              filter: "drop-shadow(0 0 6px rgba(255,209,102,0.85))",
            },
          }
        : { ...e, style: { ...base, opacity: 0.08 } };
    });
  }, [rfEdges, highlight]);

  // Re-fit as the graph grows so new outer rings stay in view — unless the user
  // has taken manual control of the view.
  useEffect(() => {
    if (!shouldAutoFit()) return;
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      if (shouldAutoFit()) fitView({ duration: 600, padding: 0.2, maxZoom: 1 });
    }, 200);
  }, [fitView, nodesData.length, edgesData.length, rootClassName, shouldAutoFit]);

  return (
    <ReactFlow
      nodes={finalNodes}
      edges={finalEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      proOptions={{ hideAttribution: true }}
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable={false}
      defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
      onMoveStart={onMoveStart}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={(_, node) => showSource(node)}
      onPaneClick={() => setHighlight(null)}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={28}
        size={1}
        color="rgba(192, 192, 200, 0.08)"
      />
      {/* Zoom controls top-right, below the Detener button — the left order
          panel covers the bottom-left, so they'd be hidden there. */}
      <Controls
        showInteractive={false}
        position="top-right"
        style={{ top: 64, right: 16 }}
      />
      <MiniMap
        nodeColor={(n) =>
          (n.data as { node?: { status?: string } })?.node?.status === "ERROR"
            ? "#DC2626"
            : "#B91C42"
        }
        nodeStrokeColor="rgba(192, 192, 200, 0.5)"
        nodeStrokeWidth={3}
        nodeBorderRadius={2}
        maskColor="rgba(10, 10, 10, 0.6)"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}

export function ListeningGraph() {
  return (
    <ReactFlowProvider>
      <ListeningGraphInner />
    </ReactFlowProvider>
  );
}
