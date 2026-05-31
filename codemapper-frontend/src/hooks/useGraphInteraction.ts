"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";

/**
 * Shared live-graph interaction: makes any React-Flow graph freely
 * pannable / zoomable with draggable nodes, WITHOUT the auto-fit yanking the
 * view back every time the data changes.
 *
 * Usage: compute your layout as before (a useMemo that returns nodes/edges),
 * pass it in, and spread the returned handlers + state onto <ReactFlow>:
 *
 *   const layout = useMemo(() => ({ nodes, edges }), [deps]);
 *   const g = useGraphInteraction(layout.nodes, layout.edges);
 *   <ReactFlow nodes={g.nodes} edges={g.edges}
 *     onNodesChange={g.onNodesChange} onEdgesChange={g.onEdgesChange}
 *     nodesDraggable onMoveStart={g.onMoveStart}
 *     onNodeDragStart={g.onNodeDragStart} onNodeDragStop={g.onNodeDragStop} />
 *
 * Then guard your fitView effect with {@link shouldAutoFit}() so it only
 * auto-fits until the user takes manual control:
 *
 *   useEffect(() => {
 *     if (!g.shouldAutoFit()) return;
 *     setTimeout(() => { if (g.shouldAutoFit()) fitView({...}); }, 200);
 *   }, [deps]);
 *
 * Positions of nodes the user dragged are preserved across rebuilds, so a
 * moved node never snaps back when new data arrives.
 */
export function useGraphInteraction(
  computedNodes: Node[],
  computedEdges: Edge[],
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Flips true the moment the user pans/zooms/drags — auto-fit then backs off.
  const userMovedRef = useRef(false);
  // className/id → position the user dragged it to; survives rebuilds.
  const draggedPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Sync the computed layout into RF's own state, keeping every node draggable
  // and preserving any user-dragged position.
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

  // event is non-null only for user-initiated pan/zoom (null = programmatic).
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

  return {
    nodes,
    edges,
    setNodes,
    onNodesChange,
    onEdgesChange,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    shouldAutoFit,
  };
}
