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
import { FocusMethodCenterNode } from "./FocusMethodCenterNode";
import { FocusPeripheralNode } from "./FocusPeripheralNode";
import { FocusEdge } from "./FocusEdge";
import { useGraphStore } from "@/store/graphStore";

const NODE_TYPES = {
  focusMethodCenter: FocusMethodCenterNode,
  focusPeripheral: FocusPeripheralNode,
};

const EDGE_TYPES = {
  focusEdge: FocusEdge,
};

const CENTER_W = 320;
const CENTER_H = 110;
const PERIPHERAL_W = 220;
const PERIPHERAL_H = 150;

function radiusFor(count: number): number {
  if (count <= 6) return 480;
  if (count <= 10) return 560;
  return 560 + (count - 10) * 32;
}

function FocusMethodGraphInner() {
  const focusMethod = useGraphStore((s) => s.focusMethod);
  const focusConnections = useGraphStore((s) => s.focusConnections);
  const selectNode = useGraphStore((s) => s.selectNode);
  const openMethodSheet = useGraphStore((s) => s.openMethodSheet);
  const { fitView } = useReactFlow();
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!focusMethod) return { nodes: [], edges: [] };

    const centerNode: Node = {
      id: focusMethod.id,
      type: "focusMethodCenter",
      position: { x: -CENTER_W / 2, y: -CENTER_H / 2 },
      data: { focus: focusMethod },
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
      id: `focus-method-edge-${conn.id}`,
      source: focusMethod.id,
      target: conn.id,
      type: "focusEdge",
      data: { connectionType: conn.connectionType, index: i },
    }));

    return {
      nodes: [centerNode, ...peripheralNodes],
      edges: peripheralEdges,
    };
  }, [focusMethod, focusConnections]);

  useEffect(() => {
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      fitView({ duration: 600, padding: 0.18, maxZoom: 1 });
    }, 200);
  }, [fitView, focusConnections.length, focusMethod?.id]);

  if (!focusMethod) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--bg-base)]">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
          Esperando método focus...
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[var(--bg-base)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
        onNodeClick={(_, node) => {
          // Center node → open method sheet from the focusMethod payload
          // (selectNode would land on class mode — wrong, this is a method).
          if (node.id === focusMethod.id) {
            openMethodSheet(focusMethod.id, {
              name: focusMethod.methodName,
              returnType: focusMethod.returnType,
              parameters: focusMethod.parameters,
              modifiers: [],
              annotations: [],
              isStatic: false,
              isAbstract: false,
              lineCount: focusMethod.lineCount,
              startLine: focusMethod.startLine,
              endLine: focusMethod.endLine,
            });
            return;
          }
          // Peripheral → existing class flow (we added them to parsedClasses)
          selectNode(node.id);
        }}
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

export function FocusMethodGraph() {
  // Re-export the store's openMethodSheet / focusClass selectors here
  // intentionally deferred — see FocusMethodGraphInner.
  return (
    <ReactFlowProvider>
      <FocusMethodGraphInner />
    </ReactFlowProvider>
  );
}
