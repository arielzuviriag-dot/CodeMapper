"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";

/**
 * Shared live-graph interaction for every React-Flow graph in the app:
 *   • drag nodes + free pan/zoom WITHOUT the auto-fit fighting (it backs off
 *     once the user takes control); dragged positions persist across rebuilds.
 *   • single click → opens that node (via the `onActivate` callback) after a
 *     short delay, so a double-click can cancel it.
 *   • double click → highlights that node's connections (fattened + glowing)
 *     and dims the rest, so you can read what it's wired to. Click the
 *     background to clear.
 *
 * Usage:
 *   const layout = useMemo(() => ({ nodes, edges }), [deps]);
 *   const g = useGraphInteraction(layout.nodes, layout.edges, (node) => openIt(node));
 *   <ReactFlow nodes={g.nodes} edges={g.edges}
 *     onNodesChange={g.onNodesChange} onEdgesChange={g.onEdgesChange}
 *     nodesDraggable onMoveStart={g.onMoveStart}
 *     onNodeDragStart={g.onNodeDragStart} onNodeDragStop={g.onNodeDragStop}
 *     onNodeClick={g.onNodeClick} onNodeDoubleClick={g.onNodeDoubleClick}
 *     onPaneClick={g.onPaneClick} />
 *
 * Guard your fitView effect with g.shouldAutoFit().
 */
export function useGraphInteraction(
  computedNodes: Node[],
  computedEdges: Edge[],
  onActivate?: (node: Node) => void,
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const userMovedRef = useRef(false);
  const draggedPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Node whose connections are highlighted (set by double-click).
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNodes(
      computedNodes.map((n) => {
        const dragged = draggedPosRef.current.get(n.id);
        return dragged
          ? { ...n, position: dragged, draggable: true }
          : { ...n, draggable: true };
      }),
    );
  }, [computedNodes, setNodes]);

  useEffect(() => {
    setEdges(computedEdges);
  }, [computedEdges, setEdges]);

  const onMoveStart = useCallback((event: unknown) => {
    if (event) userMovedRef.current = true;
  }, []);
  const onNodeDragStart = useCallback(() => {
    userMovedRef.current = true;
  }, []);
  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    draggedPosRef.current.set(node.id, node.position);
  }, []);
  const shouldAutoFit = useCallback(() => !userMovedRef.current, []);

  // Single click → activate after a short delay (double-click cancels it).
  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (!onActivate) return;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      const n = node;
      clickTimer.current = setTimeout(() => onActivate(n), 220);
    },
    [onActivate],
  );

  const onNodeDoubleClick = useCallback((_: unknown, node: Node) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setHighlightId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setHighlightId(null);
  }, []);

  // Fatten + glow the highlighted node's edges; dim the rest.
  const styledEdges = useMemo(() => {
    if (!highlightId) return edges;
    return edges.map((e) => {
      const lit = e.source === highlightId || e.target === highlightId;
      const base = (e.style ?? {}) as React.CSSProperties;
      if (lit) {
        const w = Number(base.strokeWidth ?? 1.5);
        return {
          ...e,
          animated: true,
          zIndex: 1000,
          style: {
            ...base,
            stroke: "#FFD166",
            strokeWidth: Math.max(w * 2.5, 4),
            opacity: 1,
            filter: "drop-shadow(0 0 6px rgba(255,209,102,0.85))",
          },
        };
      }
      return { ...e, style: { ...base, opacity: 0.1 } };
    });
  }, [edges, highlightId]);

  const styledNodes = useMemo(() => {
    if (!highlightId) return nodes;
    const connected = new Set<string>([highlightId]);
    for (const e of edges) {
      if (e.source === highlightId) connected.add(e.target);
      if (e.target === highlightId) connected.add(e.source);
    }
    return nodes.map((n) =>
      connected.has(n.id)
        ? {
            ...n,
            // CSS `scale` (not transform) so it composes with React Flow's
            // translate — the connected cards grow without breaking position,
            // and stay relatively bigger as you zoom in.
            zIndex: 10,
            style: {
              ...(n.style ?? {}),
              scale: "1.35",
              opacity: 1,
              transition: "scale 0.15s ease-out",
            },
          }
        : { ...n, style: { ...(n.style ?? {}), opacity: 0.25 } },
    );
  }, [nodes, edges, highlightId]);

  return {
    nodes: styledNodes,
    edges: styledEdges,
    setNodes,
    onNodesChange,
    onEdgesChange,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    onNodeClick,
    onNodeDoubleClick,
    onPaneClick,
    shouldAutoFit,
  };
}
