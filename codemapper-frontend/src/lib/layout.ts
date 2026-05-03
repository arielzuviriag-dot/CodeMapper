import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import type { ClassNodeData } from "./types";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 220;
const COLUMN_WIDTH = 320;
const ROW_HEIGHT = 400;

/**
 * Maps the primary @annotation to a fixed vertical layer.
 * Lower index = higher up in the canvas (controllers on top, entities below).
 */
const LAYER_BY_ANNOTATION: Record<string, number> = {
  RestController: 0,
  Controller: 0,
  Service: 1,
  Component: 1,
  Repository: 2,
  Entity: 3,
  Configuration: 4,
};
const FALLBACK_LAYER = 4;

function classDataOf(node: Node): ClassNodeData | undefined {
  return (node.data as { classData?: ClassNodeData } | undefined)?.classData;
}

function getLayer(node: Node): number {
  const data = classDataOf(node);
  for (const ann of data?.annotations ?? []) {
    const stripped = ann.replace(/^@/, "").split("(")[0];
    const idx = LAYER_BY_ANNOTATION[stripped];
    if (idx !== undefined) return idx;
  }
  return FALLBACK_LAYER;
}

/**
 * Layered layout: classes are grouped vertically by their primary
 * stereotype annotation, then distributed horizontally within each layer.
 * Inside each layer we still run dagre (LR) to minimise edge crossings.
 */
export function applyDagreLayout<TNode extends Node, TEdge extends Edge>(
  nodes: TNode[],
  edges: TEdge[],
): TNode[] {
  if (nodes.length === 0) return nodes;

  const byLayer = new Map<number, TNode[]>();
  for (const n of nodes) {
    const layer = getLayer(n);
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(n);
  }

  const layeredOrder = new Map<string, number>();
  for (const [, layerNodes] of byLayer) {
    const ids = new Set(layerNodes.map((n) => n.id));
    const subEdges = edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );
    const ordered = orderWithinLayer(layerNodes, subEdges);
    ordered.forEach((n, idx) => layeredOrder.set(n.id, idx));
  }

  const layerSizes = new Map<number, number>();
  for (const [layer, layerNodes] of byLayer) {
    layerSizes.set(layer, layerNodes.length);
  }

  return nodes.map((n) => {
    const layer = getLayer(n);
    const idx = layeredOrder.get(n.id) ?? 0;
    const total = layerSizes.get(layer) ?? 1;
    const xOffset = -((total - 1) * COLUMN_WIDTH) / 2;
    return {
      ...n,
      position: {
        x: xOffset + idx * COLUMN_WIDTH,
        y: layer * ROW_HEIGHT,
      },
    };
  });
}

/** Order a single layer left-to-right using dagre (LR) on the sub-graph. */
function orderWithinLayer<TNode extends Node, TEdge extends Edge>(
  layerNodes: TNode[],
  edges: TEdge[],
): TNode[] {
  if (layerNodes.length <= 1) return layerNodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 200,
    marginx: 20,
    marginy: 20,
  });

  layerNodes.forEach((n) =>
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }),
  );
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return [...layerNodes].sort((a, b) => {
    const ax = g.node(a.id)?.x ?? 0;
    const bx = g.node(b.id)?.x ?? 0;
    if (ax !== bx) return ax - bx;
    return a.id.localeCompare(b.id);
  });
}
