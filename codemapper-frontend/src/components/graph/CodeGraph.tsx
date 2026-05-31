"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  type Edge,
  type EdgeMarkerType,
  MarkerType,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClassNode } from "./ClassNode";
import { EdgeLegend } from "./EdgeLegend";
import { ClassKindLegend } from "./ClassKindLegend";
import { GraphControls } from "./GraphControls";
import { GraphSearchInput } from "./GraphSearchInput";
import { StackedLabelEdge } from "./StackedLabelEdge";
import { useGraphStore } from "@/store/graphStore";
import { applyDagreLayout } from "@/lib/layout";
import type { ClassNodeData, ConnectionType } from "@/lib/types";

const nodeTypes = { classNode: ClassNode };
const edgeTypes = { stackedLabel: StackedLabelEdge };

interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  marker?: EdgeMarkerType;
}

/* ============================================================
 * Edge palette — silver hairlines + bordó accent for injection.
 * Uses literal hex values (matched to the design tokens) so
 * @xyflow/react gets a static value rather than a CSS variable.
 *
 *   silver-mid  #C0C0C8  → EXTENDS / IMPLEMENTS (structural)
 *   silver-dark #6B6B73  → COMPOSITION
 *   bordo       #B91C42  → DEPENDENCY_INJECTION (animated)
 *   bordo-mid   #8B0F2A  → ANNOTATION_USAGE
 *   silver-deep #4A4A50  → METHOD_CALL (placeholder)
 * ============================================================ */
const EDGE_STYLES: Record<ConnectionType, EdgeStyle> = {
  EXTENDS: {
    stroke: "#C0C0C8",
    strokeWidth: 1.5,
    marker: { type: MarkerType.Arrow, color: "#C0C0C8", width: 20, height: 20 },
  },
  IMPLEMENTS: {
    stroke: "#C0C0C8",
    strokeWidth: 1.5,
    strokeDasharray: "5,5",
    marker: { type: MarkerType.Arrow, color: "#C0C0C8", width: 20, height: 20 },
  },
  COMPOSITION: {
    stroke: "#6B6B73",
    strokeWidth: 1.25,
  },
  DEPENDENCY_INJECTION: {
    stroke: "#B91C42",
    strokeWidth: 2,
    marker: { type: MarkerType.ArrowClosed, color: "#B91C42", width: 18, height: 18 },
  },
  METHOD_CALL: {
    // TODO: implementar a futuro
    stroke: "#4A4A50",
    strokeWidth: 1,
    strokeDasharray: "2,4",
  },
  ANNOTATION_USAGE: {
    stroke: "#8B0F2A",
    strokeWidth: 1.25,
    strokeDasharray: "2,3",
  },
  // Front-end screen → controller. Internet blue, dashed, animated — reads as
  // a cross-stack "web call" distinct from the silver/bordó Java edges.
  HTTP_CALL: {
    stroke: "#2F81F7",
    strokeWidth: 2,
    strokeDasharray: "6,3",
    marker: { type: MarkerType.ArrowClosed, color: "#2F81F7", width: 18, height: 18 },
  },
};

function CodeGraphInner() {
  const version = useGraphStore((s) => s.version);
  const filters = useGraphStore((s) => s.filters);
  const userInteracted = useGraphStore((s) => s.userInteracted);
  const markUserInteracted = useGraphStore((s) => s.markUserInteracted);
  const sessionStatus = useGraphStore((s) => s.sessionStatus);
  const layoutResetTick = useGraphStore((s) => s.layoutResetTick);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const lastLayoutCount = useRef(0);
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterClasses = useCallback(
    (list: ClassNodeData[]): ClassNodeData[] =>
      list.filter((n) => {
        if (filters.searchQuery.trim()) {
          const q = filters.searchQuery.toLowerCase();
          if (
            !n.name.toLowerCase().includes(q) &&
            !n.fullyQualifiedName.toLowerCase().includes(q)
          )
            return false;
        }
        if (filters.classTypeFilters[n.type] === false) return false;
        const stripped = (n.annotations ?? []).map(
          (a) => a.replace(/^@/, "").split("(")[0],
        );
        const known = stripped.filter((s) => s in filters.annotationFilters);
        if (known.length > 0 && !known.some((s) => filters.annotationFilters[s])) {
          return false;
        }
        return true;
      }),
    [filters],
  );

  const scheduleFit = useCallback(() => {
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
    }, 300);
  }, [fitView]);

  useEffect(() => {
    const state = useGraphStore.getState();
    const filteredClasses = filterClasses(Array.from(state.nodes.values()));
    const visibleIds = new Set(filteredClasses.map((n) => n.id));

    setNodes((curr) => {
      const prevById = new Map(curr.map((n) => [n.id, n]));
      const nextNodes: Node[] = filteredClasses.map((data) => {
        const prev = prevById.get(data.id);
        if (prev && (prev.data as { classData: ClassNodeData }).classData === data) {
          return prev;
        }
        return {
          id: data.id,
          type: "classNode",
          position: prev?.position ?? { x: 0, y: 0 },
          data: { classData: data },
        };
      });

      // First pass: count edges per (source, target) so each edge knows
      // its index among siblings — used by the StackedLabelEdge to bow
      // the curves perpendicularly and keep labels from colliding.
      // Also filter out edges whose ConnectionType is unchecked in the
      // EdgeLegend ("CONEXIONES") panel.
      const connTypeFilters = filters.connectionTypeFilters;
      const visibleConns = state.edges.filter(
        (c) =>
          visibleIds.has(c.from) &&
          visibleIds.has(c.to) &&
          connTypeFilters[c.type] !== false,
      );
      const pairCounts = new Map<string, number>();
      for (const c of visibleConns) {
        const key = `${c.from}|${c.to}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
      const pairSeen = new Map<string, number>();

      const seenEdgeIds = new Set<string>();
      const nextEdges: Edge[] = visibleConns.map((c, idx) => {
        const style = EDGE_STYLES[c.type];
        const key = `${c.from}|${c.to}`;
        const siblingCount = pairCounts.get(key) ?? 1;
        const siblingIndex = pairSeen.get(key) ?? 0;
        pairSeen.set(key, siblingIndex + 1);

        let id = `${c.from}--${c.type}--${c.to}--${idx}`;
        while (seenEdgeIds.has(id))
          id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
        seenEdgeIds.add(id);
        return {
          id,
          source: c.from,
          target: c.to,
          label: c.label,
          type: "stackedLabel",
          animated: c.type === "DEPENDENCY_INJECTION" || c.type === "HTTP_CALL",
          markerEnd: style.marker,
          style: {
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            strokeDasharray: style.strokeDasharray,
          },
          data: { siblingIndex, siblingCount, accent: style.stroke },
        };
      });

      const grew = nextNodes.length - lastLayoutCount.current;
      const shouldLayout =
        !userInteracted &&
        (grew >= 10 ||
          (sessionStatus === "complete" && nextNodes.length !== curr.length));

      setEdges(nextEdges);

      if (shouldLayout) {
        lastLayoutCount.current = nextNodes.length;
        if (layoutTimer.current) clearTimeout(layoutTimer.current);
        layoutTimer.current = setTimeout(() => {
          setNodes((latest) => {
            const laid = applyDagreLayout(latest, nextEdges);
            scheduleFit();
            return laid;
          });
        }, 0);
      }

      return nextNodes;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, filters, sessionStatus]);

  const onRelayout = useCallback(() => {
    setNodes((curr) => {
      const laid = applyDagreLayout(curr, edges);
      scheduleFit();
      return laid;
    });
  }, [edges, scheduleFit, setNodes]);

  // React to "Reset layout" clicks fired from the FilterPanel that lives in
  // the outer sidebar — keeps the layout function local to the graph but
  // exposes a trigger via the store. Skips the initial render.
  const lastLayoutTick = useRef(layoutResetTick);
  useEffect(() => {
    if (layoutResetTick === lastLayoutTick.current) return;
    lastLayoutTick.current = layoutResetTick;
    onRelayout();
  }, [layoutResetTick, onRelayout]);

  return (
    <div className="relative h-full w-full bg-[var(--bg-base)]">
      {/* Floating search input — centered at the top of the graph area.
          Lives outside FilterPanel so it doesn't compete with the
          ANOTACIONES block in the left sidebar. */}
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <GraphSearchInput />
      </div>

      {/* Edge legend lives below the zoom controls (which are pinned at
          right-4 top-4) so the two sit as separate blocks in the same
          right column. Doesn't compete with the minimap at bottom-right;
          Filters panel lives in the page's outer left sidebar. */}
      <aside className="absolute right-4 top-[64px] z-10 flex w-[170px] flex-col gap-2">
        <EdgeLegend />
        <ClassKindLegend />
      </aside>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(changes) => {
          if (changes.some((c) => c.type === "position" && c.dragging === false)) {
            markUserInteracted();
          }
          onNodesChange(changes);
        }}
        onEdgesChange={onEdgesChange}
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultViewport={{ x: 0, y: 0, zoom: 0.4 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(192, 192, 200, 0.08)"
        />
        <MiniMap
          nodeColor={(n) => {
            const data = (n.data as { classData?: ClassNodeData })?.classData;
            if (data?.type === "WEB_SCREEN") return "#2F81F7"; // web = internet blue
            if (data?.type === "MOBILE_SCREEN") return "#0F9D58"; // mobile = emerald
            const ann = data?.annotations?.[0]?.replace(/^@/, "").split("(")[0];
            switch (ann) {
              case "Service":
                return "#C0C0C8"; // plata clásica
              case "RestController":
              case "Controller":
                return "#B91C42"; // bordó vibrante
              case "Repository":
                return "#5C0A1A"; // bordó oscuro
              case "Component":
                return "#4A5568"; // gris azulado
              case "Entity":
                return "#8B0F2A"; // bordó medio
              case "Configuration":
                return "#A8A8B0"; // plata medio
              default:
                return "#3A3A3A"; // border-default
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

      <GraphControls onRelayout={onRelayout} />
    </div>
  );
}

export function CodeGraph() {
  return (
    <ReactFlowProvider>
      <CodeGraphInner />
    </ReactFlowProvider>
  );
}
