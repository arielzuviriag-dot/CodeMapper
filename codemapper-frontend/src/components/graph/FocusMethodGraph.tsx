"use client";

import {
  Background,
  BackgroundVariant,
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

const NODE_TYPES = {
  focusMethodCenter: FocusMethodCenterNode,
  focusPeripheral: FocusPeripheralNode,
};

const EDGE_TYPES = {
  focusEdge: FocusEdge,
};

/* ============================================================
 * Two-column layout: incoming callers on the LEFT of the focus
 * method, outgoing calls on the RIGHT. Each column stacks its
 * peripherals vertically, centered around the focus node, so the
 * graph reads like a sentence: "X, Y, Z call ME, and I call A, B".
 * ============================================================ */
const CENTER_W = 320;
const CENTER_H = 110;
const PERIPHERAL_W = 220;
const PERIPHERAL_H = 150;
const COLUMN_X = 460;
const ROW_GAP = 200;

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

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
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
    // type is unchecked before splitting into columns, so the layout stays
    // tight.
    const visibleConnections = focusConnections.filter(
      (c) =>
        classTypeFilters[c.type] !== false &&
        focusConnectionTypeFilters[c.connectionType] !== false,
    );
    // Split connections into the two columns. INVOKES_METHOD is the legacy
    // "incoming caller" type; INVOKES_OUTGOING is the new "this method calls
    // X" side. Anything else falls back to outgoing for safety.
    const incoming = visibleConnections.filter(
      (c) => c.connectionType === "INVOKES_METHOD",
    );
    const outgoing = visibleConnections.filter(
      (c) => c.connectionType === "INVOKES_OUTGOING",
    );
    const other = visibleConnections.filter(
      (c) =>
        c.connectionType !== "INVOKES_METHOD" &&
        c.connectionType !== "INVOKES_OUTGOING",
    );

    const stackY = (i: number, total: number) =>
      (i - (total - 1) / 2) * ROW_GAP;

    const incomingNodes: Node[] = incoming.map((conn, i) => ({
      id: conn.id,
      type: "focusPeripheral",
      position: {
        x: -COLUMN_X - PERIPHERAL_W / 2,
        y: stackY(i, incoming.length) - PERIPHERAL_H / 2,
      },
      width: PERIPHERAL_W,
      height: PERIPHERAL_H,
      data: { payload: conn, index: i },
      draggable: false,
    }));

    const outgoingNodes: Node[] = outgoing.map((conn, i) => ({
      id: conn.id,
      type: "focusPeripheral",
      position: {
        x: COLUMN_X - PERIPHERAL_W / 2,
        y: stackY(i, outgoing.length) - PERIPHERAL_H / 2,
      },
      width: PERIPHERAL_W,
      height: PERIPHERAL_H,
      data: { payload: conn, index: incoming.length + i },
      draggable: false,
    }));

    // Defensive: if a connection doesn't fall into either bucket (shouldn't
    // happen for method-focus mode), drop it to the right column so it stays
    // visible rather than silently disappearing.
    const otherNodes: Node[] = other.map((conn, i) => ({
      id: conn.id,
      type: "focusPeripheral",
      position: {
        x: COLUMN_X - PERIPHERAL_W / 2,
        y:
          stackY(outgoing.length + i, outgoing.length + other.length) -
          PERIPHERAL_H / 2,
      },
      width: PERIPHERAL_W,
      height: PERIPHERAL_H,
      data: { payload: conn, index: incoming.length + outgoing.length + i },
      draggable: false,
    }));

    // Peripherals only expose target handles; keep the line as focus →
    // peripheral and let FocusEdge swap the arrow marker (start vs end) to
    // show whether this is an incoming caller or an outgoing call. Choose
    // the handle pair based on which column the peripheral lives in so the
    // line meets each card on its inner edge instead of the top handle.
    const buildEdge = (
      conn: (typeof focusConnections)[number],
      i: number,
    ): Edge => {
      const isLeft = conn.connectionType === "INVOKES_METHOD";
      return {
        id: `focus-method-edge-${conn.id}`,
        source: focusMethod.id,
        sourceHandle: isLeft ? "src-left" : "src-right",
        target: conn.id,
        targetHandle: isLeft ? "tgt-right" : "tgt-left",
        type: "focusEdge",
        data: {
          connectionType: conn.connectionType,
          index: i,
          viaMethodInSource: conn.viaMethodInSource ?? null,
          viaMethodInTarget: conn.viaMethodInTarget ?? null,
        },
      };
    };

    const peripheralEdges: Edge[] = visibleConnections.map(buildEdge);

    return {
      nodes: [centerNode, ...incomingNodes, ...outgoingNodes, ...otherNodes],
      edges: peripheralEdges,
    };
  }, [focusMethod, focusConnections, classTypeFilters, focusConnectionTypeFilters]);

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
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <GraphSearchInput />
      </div>
      <aside className="absolute right-4 top-4 z-10 flex w-[170px] flex-col gap-2">
        <FocusConnectionLegend />
        <ClassKindLegend />
      </aside>
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
