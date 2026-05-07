"use client";

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
import { useEffect, useMemo, useRef } from "react";
import { FocusCenterNode } from "./FocusCenterNode";
import { FocusPeripheralNode } from "./FocusPeripheralNode";
import { FocusEdge } from "./FocusEdge";
import { useGraphStore } from "@/store/graphStore";

const FOCUS_NODE_TYPES = {
  focusCenter: FocusCenterNode,
  focusPeripheral: FocusPeripheralNode,
};

const FOCUS_EDGE_TYPES = {
  focusEdge: FocusEdge,
};

/* ============================================================
 * Radial layout — focus class at the origin, level-1 deps in
 * a ring around it. Radius grows with the number of connections
 * so peripherals don't overlap.
 *
 *   centerAnchor (0, 0)
 *   peripheral_i.center = ( R * cos(angle_i), R * sin(angle_i) )
 *   angle_i = -π/2 + (i / N) * 2π     // start at top, clockwise
 * ============================================================ */
const CENTER_W = 400;
const CENTER_H = 360;
const PERIPHERAL_W = 220;
const PERIPHERAL_H = 150;

function radiusFor(count: number): number {
  if (count <= 6) return 460;
  if (count <= 10) return 520;
  return 520 + (count - 10) * 30;
}

function FocusGraphInner() {
  const focusClass = useGraphStore((s) => s.focusClass);
  const focusConnections = useGraphStore((s) => s.focusConnections);
  const { fitView } = useReactFlow();
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!focusClass) {
      return { nodes: [], edges: [] };
    }

    const centerNode: Node = {
      id: focusClass.id,
      type: "focusCenter",
      position: { x: -CENTER_W / 2, y: -CENTER_H / 2 },
      data: { focus: focusClass },
      draggable: false,
      selectable: false,
    };

    const N = focusConnections.length;
    const radius = radiusFor(N);

    const peripheralNodes: Node[] = focusConnections.map((conn, i) => {
      const angle = -Math.PI / 2 + (i / Math.max(N, 1)) * 2 * Math.PI;
      const cx = radius * Math.cos(angle);
      const cy = radius * Math.sin(angle);
      return {
        id: conn.id,
        type: "focusPeripheral",
        position: { x: cx - PERIPHERAL_W / 2, y: cy - PERIPHERAL_H / 2 },
        data: { payload: conn, index: i },
        draggable: false,
      };
    });

    const peripheralEdges: Edge[] = focusConnections.map((conn, i) => ({
      id: `focus-edge-${conn.id}`,
      source: focusClass.id,
      target: conn.id,
      type: "focusEdge",
      data: { connectionType: conn.connectionType, index: i },
    }));

    return {
      nodes: [centerNode, ...peripheralNodes],
      edges: peripheralEdges,
    };
  }, [focusClass, focusConnections]);

  useEffect(() => {
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      fitView({ duration: 600, padding: 0.18, maxZoom: 1 });
    }, 200);
  }, [fitView, focusConnections.length, focusClass?.id]);

  if (!focusClass) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--bg-base)]">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
          Esperando archivo focus...
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[var(--bg-base)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={FOCUS_NODE_TYPES}
        edgeTypes={FOCUS_EDGE_TYPES}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(192, 192, 200, 0.08)"
        />
      </ReactFlow>
    </div>
  );
}

export function FocusGraph() {
  return (
    <ReactFlowProvider>
      <FocusGraphInner />
    </ReactFlowProvider>
  );
}
