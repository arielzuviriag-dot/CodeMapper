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
import { FocusCenterNode } from "./FocusCenterNode";
import { FocusPeripheralNode } from "./FocusPeripheralNode";
import { FocusEdge } from "./FocusEdge";
import { ClassKindLegend } from "./ClassKindLegend";
import { FocusConnectionLegend } from "./FocusConnectionLegend";
import { GraphSearchInput } from "./GraphSearchInput";
import { JavaVersionBadge } from "./JavaVersionBadge";
import { ImpactSimulationButton } from "./ImpactSimulationButton";
import { useGraphStore } from "@/store/graphStore";
import { buildFocusEdgeDescriptors } from "./focusGraphGrouping";
import { passesDirectionFilter } from "./focusDirection";
import { FocusDirectionFilter } from "./FocusDirectionFilter";
import type { FocusConnectionPayload } from "@/lib/types";

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
 *
 * Edges are floating: they don't pin to a handle id, FocusEdge computes
 * its own endpoints from the node centers each render. That's what lets
 * the ring rebalance with every new arrival without ReactFlow tearing
 * down and recreating the edge components (which used to happen because
 * the handle picked by pickHandles flipped as cx/cy crossed an axis).
 * ============================================================ */
// Center node grew in F1 to host the contract surface (method pins + exception
// cluster). Width bumped 280→340 to fit method names with security badges;
// the actual rendered height varies with the class — the constants here drive
// the initial centering offset only. Radii bumped accordingly so peripherals
// stay clear of the now-taller card.
const CENTER_W = 340;
const CENTER_H = 220;
const PERIPHERAL_W = 220;
const PERIPHERAL_H = 150;

function radiusFor(count: number): number {
  if (count <= 6) return 540;
  if (count <= 10) return 620;
  return 620 + (count - 10) * 32;
}

function FocusGraphInner() {
  const focusClass = useGraphStore((s) => s.focusClass);
  const focusConnections = useGraphStore((s) => s.focusConnections);
  const classTypeFilters = useGraphStore((s) => s.filters.classTypeFilters);
  const focusConnectionTypeFilters = useGraphStore(
    (s) => s.filters.focusConnectionTypeFilters,
  );
  const showTests = useGraphStore((s) => s.showTests);
  const impactReport = useGraphStore((s) => s.impactReport);
  const selectNode = useGraphStore((s) => s.selectNode);
  const edgeGrouping = useGraphStore((s) => s.edgeGrouping);
  const focusDirectionFilter = useGraphStore((s) => s.focusDirectionFilter);
  const { fitView } = useReactFlow();
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!focusClass) {
      return { nodes: [], edges: [] };
    }

    // F4 — precompute impact lookup sets so we can tag peripherals in O(1).
    // When no impact report is loaded these are empty sets and the className
    // logic below reduces to a no-op.
    const directSet = new Set(impactReport?.directCallers ?? []);
    const transitiveSet = new Set(impactReport?.transitiveCallers ?? []);
    const testSet = new Set(impactReport?.affectedTests ?? []);

    const centerNode: Node = {
      id: focusClass.id,
      type: "focusCenter",
      position: { x: -CENTER_W / 2, y: -CENTER_H / 2 },
      // Width/height explicit so MiniMap puede dibujarlo desde el primer
      // render — sin estos, el rect queda 0×0 antes de que ResizeObserver
      // reporte las medidas reales.
      width: CENTER_W,
      height: CENTER_H,
      data: { focus: focusClass, hasCycles: impactReport?.hasCycles ?? false },
      draggable: false,
      selectable: false,
      className: impactReport ? "cm-impact-focus" : undefined,
    };

    // Honour both legends' checkboxes — hide peripherals whose class kind OR
    // connection type is unchecked. Filtering before the layout step keeps
    // spacing tight (we don't waste angles on hidden cards).
    // F3: also drop test peripherals when the "Mostrar tests" toggle is off
    // (default). Mocks are tests too, so they're hidden together.
    // P2 — direction filter is intersected with the existing per-type and
    // per-class-kind filters. None of them override each other: a peripheral
    // must satisfy ALL active filters to remain visible.
    const filtered = focusConnections.filter(
      (c) =>
        classTypeFilters[c.type] !== false &&
        focusConnectionTypeFilters[c.connectionType] !== false &&
        passesDirectionFilter(c.connectionType, focusDirectionFilter) &&
        (showTests || !c.isTest),
    );
    // P4 — depth-1 (default) carries the radial ring; depth-2 sits on a short
    // arc anchored to its depth-1 parent. We never let depth-2 rebalance the
    // primary ring — the user expanded a node, the rest of the map shouldn't
    // shift under them.
    const visibleConnections = filtered.filter((c) => (c.depth ?? 1) === 1);
    const depthTwoConnections = filtered.filter((c) => (c.depth ?? 1) === 2);

    // P1 — group visible connections by peripheral class id. Each group renders
    // as ONE peripheral node. The edge descriptors come from a pure helper so
    // the per-method dedupe + curve-index math stays trivially testable.
    const descriptors = buildFocusEdgeDescriptors(visibleConnections, edgeGrouping);
    const orderedGroupKeys: string[] = [];
    for (const d of descriptors) {
      if (!orderedGroupKeys.includes(d.classId)) orderedGroupKeys.push(d.classId);
    }
    const N = orderedGroupKeys.length;
    const radius = radiusFor(N);

    const groupHead = new Map<string, FocusConnectionPayload>();
    const groupIndex = new Map<string, number>();
    orderedGroupKeys.forEach((classId, i) => {
      groupIndex.set(classId, i);
      const head = descriptors.find((d) => d.classId === classId)!.connection;
      groupHead.set(classId, head);
    });

    const peripheralNodes: Node[] = orderedGroupKeys.map((classId, i) => {
      const head = groupHead.get(classId)!;
      const angle = -Math.PI / 2 + (i / Math.max(N, 1)) * 2 * Math.PI;
      const cx = radius * Math.cos(angle);
      const cy = radius * Math.sin(angle);
      // F4 — pick the most specific impact bucket. Test wins (it's the
      // loudest signal: "if you change focus this test breaks"), then direct,
      // then transitive. Without a report all classNames are undefined.
      let impactClass: string | undefined;
      if (impactReport) {
        if (testSet.has(head.fullyQualifiedName)) impactClass = "cm-impact-test";
        else if (directSet.has(head.fullyQualifiedName)) impactClass = "cm-impact-direct";
        else if (transitiveSet.has(head.fullyQualifiedName)) impactClass = "cm-impact-transitive";
      }
      return {
        id: head.id,
        type: "focusPeripheral",
        position: { x: cx - PERIPHERAL_W / 2, y: cy - PERIPHERAL_H / 2 },
        width: PERIPHERAL_W,
        height: PERIPHERAL_H,
        data: { payload: head, index: i },
        draggable: false,
        className: impactClass,
      } satisfies Node;
    });

    const peripheralEdges: Edge[] = descriptors.map((d) => ({
      id: d.edgeId,
      source: focusClass.id,
      target: d.classId,
      type: "focusEdge",
      data: {
        connectionType: d.connection.connectionType,
        index: groupIndex.get(d.classId) ?? 0,
        viaMethodInSource: d.connection.viaMethodInSource ?? null,
        viaMethodInTarget: d.connection.viaMethodInTarget ?? null,
        isTest: d.connection.isTest ?? false,
        isMock: d.connection.isMock ?? false,
        firstSeenAt: d.connection.firstSeenAt ?? Date.now(),
        siblingIndex: d.siblingIndex,
        siblingCount: d.siblingCount,
        aggregatedMethods: d.aggregatedMethods,
        referenceKind: d.connection.referenceKind ?? null,
        depth: 1,
        curvature: d.curvature,
        bidirectional: d.bidirectional,
      },
    }));

    // ── P4 — depth-2 sub-arc layout ─────────────────────────────────────
    //
    // For each expanded parent we walk a 60° arc centred on the parent's
    // outward radial direction (away from the focus class) and place the
    // children at a fixed distance from the parent. We DO NOT touch the
    // depth-1 ring — angles and groupIndex stay frozen so the user's mental
    // map is preserved while they explore.
    const ARC_SPAN = (60 * Math.PI) / 180;
    const SUB_RADIUS = PERIPHERAL_W * 1.3;
    const childrenByParent = new Map<string, FocusConnectionPayload[]>();
    for (const c of depthTwoConnections) {
      if (!c.parentFqn) continue;
      const arr = childrenByParent.get(c.parentFqn) ?? [];
      arr.push(c);
      childrenByParent.set(c.parentFqn, arr);
    }
    const depth2Nodes: Node[] = [];
    const depth2Edges: Edge[] = [];
    childrenByParent.forEach((children, parentFqn) => {
      const parentHead = Array.from(groupHead.values()).find(
        (h) => h.fullyQualifiedName === parentFqn,
      );
      if (!parentHead) return;
      const parentIndex = groupIndex.get(parentHead.id) ?? 0;
      const baseAngle = -Math.PI / 2 + (parentIndex / Math.max(N, 1)) * 2 * Math.PI;
      // Dedup children by id (one node per child class — multiple methods
      // share the same card just like depth-1 peripherals do).
      const unique = new Map<string, FocusConnectionPayload>();
      const ordered: string[] = [];
      for (const c of children) {
        if (!unique.has(c.id)) {
          unique.set(c.id, c);
          ordered.push(c.id);
        }
      }
      const count = ordered.length;
      ordered.forEach((childId, j) => {
        const conn = unique.get(childId)!;
        const offset = count === 1 ? 0 : (j / (count - 1)) - 0.5; // -0.5..+0.5
        const angle = baseAngle + offset * ARC_SPAN;
        const px = Math.cos(baseAngle) * radius;
        const py = Math.sin(baseAngle) * radius;
        const cx = px + Math.cos(angle) * SUB_RADIUS;
        const cy = py + Math.sin(angle) * SUB_RADIUS;
        depth2Nodes.push({
          id: childId,
          type: "focusPeripheral",
          position: { x: cx - PERIPHERAL_W / 2, y: cy - PERIPHERAL_H / 2 },
          width: PERIPHERAL_W,
          height: PERIPHERAL_H,
          data: { payload: conn, index: j },
          draggable: false,
        } satisfies Node);
        depth2Edges.push({
          id: `focus-edge-d2-${parentHead.id}-${childId}-${conn.viaMethodInTarget ?? `idx${j}`}`,
          source: parentHead.id,
          target: childId,
          type: "focusEdge",
          data: {
            connectionType: conn.connectionType,
            index: 0,
            viaMethodInSource: conn.viaMethodInSource ?? null,
            viaMethodInTarget: conn.viaMethodInTarget ?? null,
            isTest: conn.isTest ?? false,
            isMock: conn.isMock ?? false,
            firstSeenAt: conn.firstSeenAt ?? Date.now(),
            siblingIndex: 0,
            siblingCount: 1,
            aggregatedMethods: null,
            referenceKind: conn.referenceKind ?? null,
            depth: 2,
          },
        });
      });
    });

    return {
      nodes: [centerNode, ...peripheralNodes, ...depth2Nodes],
      edges: [...peripheralEdges, ...depth2Edges],
    };
  }, [focusClass, focusConnections, classTypeFilters, focusConnectionTypeFilters, showTests, impactReport, edgeGrouping, focusDirectionFilter]);

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
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <GraphSearchInput />
      </div>
      {/* F4 — simulate-change panel sits at top-left, balancing the top-right
          legends. Becomes a banner with the impact counter once active. P2
          adds the direction segmented control right below it so the dev can
          collapse the radial to incoming/outgoing without opening the legend. */}
      <div className="absolute left-4 top-4 z-10 flex w-[220px] flex-col gap-2">
        <ImpactSimulationButton />
        <FocusDirectionFilter />
      </div>
      <aside className="absolute right-4 top-4 z-10 flex w-[170px] flex-col items-end gap-2">
        <JavaVersionBadge />
        <ShowTestsToggle />
        <FocusConnectionLegend />
        <ClassKindLegend />
      </aside>
      {/* F4 — atenúa el canvas detrás de los nodos cuando el modo simular
          está activo. Center y peripherals afectados se quedan al 100%; el
          resto se ve borroso con CSS class .cm-impact-active. */}
      <ReactFlow
        className={impactReport ? "cm-impact-active" : ""}
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
        onNodeClick={(_, node) => {
          selectNode(node.id);
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(192, 192, 200, 0.08)"
        />
        {/* MiniMap — paleta consistente con CodeGraph: bordó para el centro
            y para llamadas, silver para herencia. Para FOCO la coloración
            la determina el connectionType del peripheral, no la annotation. */}
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "focusCenter") return "#B91C42";
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

/** F3 — toggle that flips the {@link useGraphStore.showTests} flag. Hidden
 *  when the current focus has zero test peripherals (silence over noise). */
function ShowTestsToggle() {
  const focusConnections = useGraphStore((s) => s.focusConnections);
  const showTests = useGraphStore((s) => s.showTests);
  const setShowTests = useGraphStore((s) => s.setShowTests);
  const testCount = focusConnections.filter((c) => c.isTest).length;
  if (testCount === 0) return null;
  return (
    <button
      type="button"
      onClick={() => setShowTests(!showTests)}
      aria-pressed={showTests}
      title={
        showTests
          ? "Ocultar peripherals de test"
          : "Mostrar peripherals de test"
      }
      className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60 ${
        showTests
          ? "border-[var(--bordo)] bg-[var(--bordo)]/10 text-[var(--bordo)]"
          : "border-[var(--border-silver)] bg-[var(--bg-card)] text-[var(--silver)] hover:border-[var(--bordo)] hover:text-[var(--bordo)]"
      }`}
    >
      <span>Tests {showTests ? "ON" : "OFF"}</span>
      <span className="font-semibold tabular-nums">{testCount}</span>
    </button>
  );
}

export function FocusGraph() {
  return (
    <ReactFlowProvider>
      <FocusGraphInner />
    </ReactFlowProvider>
  );
}
