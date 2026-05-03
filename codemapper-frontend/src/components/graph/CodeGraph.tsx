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
import { useCallback, useEffect, useRef } from "react";
import { ClassNode } from "./ClassNode";
import { EdgeLegend } from "./EdgeLegend";
import { FilterPanel } from "./FilterPanel";
import { GraphControls } from "./GraphControls";
import { useGraphStore } from "@/store/graphStore";
import { applyDagreLayout } from "@/lib/layout";
import type { ClassNodeData, ConnectionType } from "@/lib/types";

const nodeTypes = { classNode: ClassNode };

interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  marker?: EdgeMarkerType;
}

const EDGE_STYLES: Record<ConnectionType, EdgeStyle> = {
  EXTENDS: {
    stroke: "#a1a1aa",
    strokeWidth: 2,
    marker: { type: MarkerType.Arrow, color: "#a1a1aa", width: 20, height: 20 },
  },
  IMPLEMENTS: {
    stroke: "#a1a1aa",
    strokeWidth: 2,
    strokeDasharray: "5,5",
    marker: { type: MarkerType.Arrow, color: "#a1a1aa", width: 20, height: 20 },
  },
  COMPOSITION: {
    stroke: "#71717a",
    strokeWidth: 1.5,
  },
  DEPENDENCY_INJECTION: {
    stroke: "#10b981",
    strokeWidth: 2,
    marker: { type: MarkerType.ArrowClosed, color: "#10b981", width: 18, height: 18 },
  },
  METHOD_CALL: {
    // TODO: implementar a futuro
    stroke: "#52525b",
    strokeWidth: 1,
    strokeDasharray: "2,4",
  },
  ANNOTATION_USAGE: {
    stroke: "#a78bfa",
    strokeWidth: 1.5,
    strokeDasharray: "2,3",
  },
};

function CodeGraphInner() {
  const version = useGraphStore((s) => s.version);
  const filters = useGraphStore((s) => s.filters);
  const userInteracted = useGraphStore((s) => s.userInteracted);
  const markUserInteracted = useGraphStore((s) => s.markUserInteracted);
  const sessionStatus = useGraphStore((s) => s.sessionStatus);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const lastLayoutCount = useRef(0);
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read directly from the store inside the effect to avoid making the whole
  // effect depend on Map/array references — `version` is the canonical signal.
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

  // Single effect reacting to flushed updates (version) + filter changes + completion.
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

      const seenEdgeIds = new Set<string>();
      const nextEdges: Edge[] = state.edges
        .filter((c) => visibleIds.has(c.from) && visibleIds.has(c.to))
        .map((c, idx) => {
          const style = EDGE_STYLES[c.type];
          let id = `${c.from}--${c.type}--${c.to}--${idx}`;
          while (seenEdgeIds.has(id))
            id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
          seenEdgeIds.add(id);
          return {
            id,
            source: c.from,
            target: c.to,
            label: c.label,
            type: "smoothstep",
            animated: c.type === "DEPENDENCY_INJECTION",
            markerEnd: style.marker,
            style: {
              stroke: style.stroke,
              strokeWidth: style.strokeWidth,
              strokeDasharray: style.strokeDasharray,
            },
            labelStyle: { fontSize: 10, fill: "#a1a1aa" },
            labelBgStyle: { fill: "#18181b", fillOpacity: 0.8 },
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

  return (
    <div className="relative h-full w-full">
      <aside className="absolute left-4 top-4 z-10 flex w-[260px] flex-col gap-3">
        <FilterPanel onResetLayout={onRelayout} />
        <EdgeLegend />
      </aside>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
        onlyRenderVisibleElements
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#27272a" />
        <MiniMap
          nodeColor={(n) => {
            const data = (n.data as { classData?: ClassNodeData })?.classData;
            const ann = data?.annotations?.[0]?.replace(/^@/, "").split("(")[0];
            switch (ann) {
              case "Service":
                return "#10b981";
              case "RestController":
              case "Controller":
                return "#8b5cf6";
              case "Repository":
                return "#f59e0b";
              case "Entity":
                return "#ec4899";
              case "Configuration":
                return "#f97316";
              default:
                return "#52525b";
            }
          }}
          maskColor="rgba(0,0,0,0.5)"
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
