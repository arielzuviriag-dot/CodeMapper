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
import { FocusMethodCenterNode } from "./FocusMethodCenterNode";
import { FocusPeripheralNode } from "./FocusPeripheralNode";
import { FocusEdge } from "./FocusEdge";
import { ClassKindLegend } from "./ClassKindLegend";
import { FocusConnectionLegend } from "./FocusConnectionLegend";
import { GraphSearchInput } from "./GraphSearchInput";
import { useGraphStore } from "@/store/graphStore";
import { useGraphInteraction } from "@/hooks/useGraphInteraction";

const NODE_TYPES = {
  focusMethodCenter: FocusMethodCenterNode,
  focusPeripheral: FocusPeripheralNode,
};

const EDGE_TYPES = {
  focusEdge: FocusEdge,
};

/* ============================================================
 * Radial layout — focus method at the origin, peripherals on a
 * ring around it. Same shape as FocusGraph (class-focus mode) so
 * the user reads both modes the same way. Edges are floating
 * (no sourceHandle/targetHandle) — FocusEdge computes its own
 * endpoints from node centers via rect intersection.
 * ============================================================ */
const CENTER_W = 320;
const CENTER_H = 110;
const PERIPHERAL_W = 220;
const PERIPHERAL_H = 150;

function radiusFor(count: number): number {
  if (count <= 6) return 540;
  if (count <= 10) return 620;
  return 620 + (count - 10) * 32;
}

function FocusMethodGraphInner() {
  const focusMethod = useGraphStore((s) => s.focusMethod);
  const focusConnections = useGraphStore((s) => s.focusConnections);
  const classTypeFilters = useGraphStore((s) => s.filters.classTypeFilters);
  const focusConnectionTypeFilters = useGraphStore(
    (s) => s.filters.focusConnectionTypeFilters,
  );
  const selectNode = useGraphStore((s) => s.selectNode);
  const openMethodSheet = useGraphStore((s) => s.openMethodSheet);
  const { fitView } = useReactFlow();
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nodes: computedNodes, edges: computedEdges } = useMemo<{
    nodes: Node[];
    edges: Edge[];
  }>(() => {
    if (!focusMethod) return { nodes: [], edges: [] };

    const centerNode: Node = {
      id: focusMethod.id,
      type: "focusMethodCenter",
      position: { x: -CENTER_W / 2, y: -CENTER_H / 2 },
      width: CENTER_W,
      height: CENTER_H,
      data: { focus: focusMethod },
      draggable: false,
      selectable: false,
    };

    // Honour both legends — drop peripherals whose class kind OR connection
    // type is unchecked before computing the radius, so the spacing reflects
    // what's actually drawn.
    const visibleConnections = focusConnections.filter(
      (c) =>
        classTypeFilters[c.type] !== false &&
        focusConnectionTypeFilters[c.connectionType] !== false,
    );
    const N = visibleConnections.length;
    const radius = radiusFor(N);

    const peripheralNodes: Node[] = [];
    const peripheralEdges: Edge[] = [];
    visibleConnections.forEach((conn, i) => {
      const angle = -Math.PI / 2 + (i / Math.max(N, 1)) * 2 * Math.PI;
      const cx = radius * Math.cos(angle);
      const cy = radius * Math.sin(angle);
      peripheralNodes.push({
        id: conn.id,
        type: "focusPeripheral",
        position: { x: cx - PERIPHERAL_W / 2, y: cy - PERIPHERAL_H / 2 },
        width: PERIPHERAL_W,
        height: PERIPHERAL_H,
        data: { payload: conn, index: i },
        draggable: false,
      });
      // Floating edge — no sourceHandle/targetHandle. FocusEdge computes
      // endpoints from node centers via rect intersection. Same approach as
      // FocusGraph, sidesteps the ReactFlow remount-on-handle-change bug.
      peripheralEdges.push({
        id: `focus-method-edge-${conn.id}`,
        source: focusMethod.id,
        target: conn.id,
        type: "focusEdge",
        data: {
          connectionType: conn.connectionType,
          index: i,
          viaMethodInSource: conn.viaMethodInSource ?? null,
          viaMethodInTarget: conn.viaMethodInTarget ?? null,
          // Wall-clock anchor for the draw animation — without this, FocusEdge
          // falls back to Date.now() each render and progress stays at 0.
          firstSeenAt: conn.firstSeenAt ?? Date.now(),
        },
      });
    });

    return {
      nodes: [centerNode, ...peripheralNodes],
      edges: peripheralEdges,
    };
  }, [focusMethod, focusConnections, classTypeFilters, focusConnectionTypeFilters]);

  const {
    nodes: rfNodes,
    edges: rfEdges,
    onNodesChange,
    onEdgesChange,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    onNodeClick,
    onNodeDoubleClick,
    onPaneClick,
    shouldAutoFit,
  } = useGraphInteraction(computedNodes, computedEdges, (node) => {
    // Center node → open the method sheet (selectNode would land on class
    // mode — wrong, this is a method). Peripheral → existing class flow.
    if (focusMethod && node.id === focusMethod.id) {
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
    selectNode(node.id);
  });

  useEffect(() => {
    if (!shouldAutoFit()) return;
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      if (!shouldAutoFit()) return;
      fitView({ duration: 600, padding: 0.18, maxZoom: 1 });
    }, 200);
  }, [fitView, focusConnections.length, focusMethod?.id, shouldAutoFit]);

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
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <GraphSearchInput />
      </div>
      <aside className="absolute right-4 top-4 z-10 flex w-[170px] flex-col gap-2">
        <FocusConnectionLegend />
        <ClassKindLegend />
      </aside>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
        onMoveStart={onMoveStart}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(192, 192, 200, 0.08)"
        />
        <Controls showInteractive={false} />
        {/* MiniMap — misma paleta que FocusGraph. El centro acá es el método
            focus (focusMethodCenter), peripherals son las clases que lo
            invocan o que él invoca. */}
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "focusMethodCenter") return "#B91C42";
            const ct = (n.data as { payload?: { connectionType?: string } })
              ?.payload?.connectionType;
            switch (ct) {
              case "CALLS":
              case "CALLED_BY":
              case "INVOKES_OUTGOING":
                return "#B91C42";
              case "INVOKES_METHOD":
                return "#5C0A1A";
              case "EXTENDS":
                return "#C0C0C8";
              case "IMPLEMENTS":
                return "#A8A8B0";
              case "USES_PROPERTIES":
                return "#8B0F2A";
              default:
                return "#888892";
            }
          }}
          nodeStrokeColor="rgba(192, 192, 200, 0.5)"
          nodeStrokeWidth={3}
          nodeBorderRadius={2}
          maskColor="rgba(10, 10, 10, 0.6)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

export function FocusMethodGraph() {
  return (
    <ReactFlowProvider>
      <FocusMethodGraphInner />
    </ReactFlowProvider>
  );
}
