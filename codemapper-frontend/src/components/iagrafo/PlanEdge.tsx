"use client";

import { memo } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";

/**
 * Arista de IA.Grafo — une dos cards afectadas y muestra, SIEMPRE visible, la
 * leyenda del "por qué se toca ahí" (`reason`). Endpoints flotantes proyectados
 * al borde de cada card (como FocusEdge/ListeningEdge), así no dependemos de
 * handles cardinales.
 */
interface PlanEdgeData extends Record<string, unknown> {
  reason: string;
  changeKind?: string;
}

const STROKE = "#8B0F2A";

function center(node: InternalNode): { x: number; y: number } {
  const w = node.measured?.width ?? node.width ?? 0;
  const h = node.measured?.height ?? node.height ?? 0;
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

function rectEdge(node: InternalNode, toward: { x: number; y: number }) {
  const w = node.measured?.width ?? node.width ?? 0;
  const h = node.measured?.height ?? node.height ?? 0;
  const cx = node.position.x + w / 2;
  const cy = node.position.y + h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if ((dx === 0 && dy === 0) || w === 0 || h === 0) return { x: cx, y: cy };
  const scale = Math.min(
    dx !== 0 ? w / 2 / Math.abs(dx) : Infinity,
    dy !== 0 ? h / 2 / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function PlanEdgeComponent({ source, target, data, markerEnd }: EdgeProps) {
  const edgeData = (data ?? {}) as PlanEdgeData;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const s = rectEdge(sourceNode, center(targetNode));
  const t = rectEdge(targetNode, center(sourceNode));
  const [path, labelX, labelY] = getBezierPath({
    sourceX: s.x,
    sourceY: s.y,
    targetX: t.x,
    targetY: t.y,
  });

  return (
    <>
      <path
        d={path}
        fill="none"
        markerEnd={markerEnd}
        style={{ stroke: STROKE, strokeWidth: 1.75 }}
        className="react-flow__edge-path"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "none",
            maxWidth: 220,
          }}
          className="rounded-md border border-[var(--bordo)]/40 bg-[var(--bg-card)]/95 px-2 py-1 text-center font-mono text-[10px] leading-tight text-[var(--silver)] shadow-[var(--shadow-sm)] backdrop-blur"
        >
          {edgeData.changeKind && (
            <span className="mb-0.5 block font-semibold uppercase tracking-[0.12em] text-[var(--bordo)]">
              {edgeData.changeKind}
            </span>
          )}
          {edgeData.reason}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const PlanEdge = memo(PlanEdgeComponent);
