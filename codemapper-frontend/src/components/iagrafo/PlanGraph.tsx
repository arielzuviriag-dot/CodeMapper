"use client";

import {
  Background,
  BackgroundVariant,
  type Edge,
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
import dagre from "dagre";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { PlanNode } from "./PlanNode";
import { PlanEdge } from "./PlanEdge";
import { useIaGrafoStore } from "@/store/iaGrafoStore";
import { fetchSource } from "@/lib/iaGrafo";

const NODE_TYPES = { plan: PlanNode };
const EDGE_TYPES = { plan: PlanEdge };
const NODE_W = 260;
const NODE_H = 130;

/** Layout dagre genérico (top-down) para el plan. */
function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 90, ranksep: 220, marginx: 40, marginy: 40 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return p ? { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } } : n;
  });
}

function PlanGraphInner() {
  const plan = useIaGrafoStore((s) => s.plan);
  const projectPath = useIaGrafoStore((s) => s.projectPath);
  const selectedNodeId = useIaGrafoStore((s) => s.selectedNodeId);
  const selectNode = useIaGrafoStore((s) => s.selectNode);
  const openSource = useIaGrafoStore((s) => s.openSource);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  // Reconstruye nodos/edges del plan y los acomoda con dagre.
  const computed = useMemo(() => {
    if (!plan) return { nodes: [] as Node[], edges: [] as Edge[] };
    const ids = new Set(plan.nodes.map((n) => n.id));
    const rfNodes: Node[] = plan.nodes.map((n) => ({
      id: n.id,
      type: "plan",
      position: { x: 0, y: 0 },
      data: { node: n, selected: n.id === selectedNodeId },
    }));
    const rfEdges: Edge[] = plan.edges
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e, i) => ({
        id: `pe-${i}-${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        type: "plan",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8B0F2A", width: 16, height: 16 },
        data: { reason: e.reason, changeKind: e.changeKind },
      }));
    return { nodes: layout(rfNodes, rfEdges), edges: rfEdges };
    // selectedNodeId intencionalmente fuera: el resaltado se aplica abajo sin
    // re-correr el layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  useEffect(() => {
    setNodes(computed.nodes);
    setEdges(computed.edges);
    const t = setTimeout(() => fitView({ duration: 400, padding: 0.2, maxZoom: 1 }), 120);
    return () => clearTimeout(t);
  }, [computed, setNodes, setEdges, fitView]);

  // Resaltado de la card seleccionada sin recalcular layout.
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...(n.data as object), selected: n.id === selectedNodeId },
      })),
    [nodes, selectedNodeId],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      selectNode(node.id);
      const pn = plan?.nodes.find((p) => p.id === node.id);
      if (!pn) return;
      const file = pn.file ?? (pn.fqcn ? pn.fqcn.replace(/\./g, "/") + ".java" : null);
      if (!file) {
        toast.message("Esta card no tiene un archivo asociado");
        return;
      }
      fetchSource(projectPath, file)
        .then((res) =>
          openSource({
            title: pn.label,
            source: res.source,
            path: res.path,
            language: res.language,
            line: pn.anchorLine,
          }),
        )
        .catch((err) => toast.error(err.message ?? "No se pudo abrir el código"));
    },
    [plan, projectPath, selectNode, openSource],
  );

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onPaneClick={() => selectNode(null)}
      proOptions={{ hideAttribution: true }}
      minZoom={0.1}
      maxZoom={2}
      defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
      nodesConnectable={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgba(192,192,200,0.08)" />
      <MiniMap
        nodeColor="#B91C42"
        nodeStrokeColor="rgba(192,192,200,0.5)"
        nodeStrokeWidth={3}
        maskColor="rgba(10,10,10,0.6)"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}

export function PlanGraph() {
  return (
    <ReactFlowProvider>
      <PlanGraphInner />
    </ReactFlowProvider>
  );
}
