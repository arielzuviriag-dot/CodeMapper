"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  EdgeLabelRenderer,
  getStraightPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";

/**
 * "Escuchando" edge — parent-class → child-class call relationship. Visually a
 * sibling of {@link FocusEdge}: floating endpoints projected onto each card's
 * rectangle and a wall-clock stroke-draw "trace" animation anchored to when
 * the edge first appeared (so ReactFlow's layout-rebalance remounts don't
 * restart it). Self-contained — no store reads.
 */

interface ListeningEdgeData extends Record<string, unknown> {
  firstSeen: number;
  /** Arrival index → small stagger so edges draw one-by-one. */
  index: number;
  isError: boolean;
}

const STROKE = "#B91C42";
const STROKE_ERROR = "#DC2626";
const ARROW_CLEARANCE = 44;
const ANIM_DURATION_MS = 1400;
const ANIM_DELAY_MS = 300;
const STAGGER_MS = 280;
const STAGGER_CAP_INDEX = 12;

function nodeCenter(node: InternalNode): { x: number; y: number } {
  const w = node.measured?.width ?? node.width ?? 0;
  const h = node.measured?.height ?? node.height ?? 0;
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

function rectIntersection(
  node: InternalNode,
  other: { x: number; y: number },
): { x: number; y: number } {
  const w = node.measured?.width ?? node.width ?? 0;
  const h = node.measured?.height ?? node.height ?? 0;
  const cx = node.position.x + w / 2;
  const cy = node.position.y + h / 2;
  const dx = other.x - cx;
  const dy = other.y - cy;
  if ((dx === 0 && dy === 0) || w === 0 || h === 0) return { x: cx, y: cy };
  const scale = Math.min(
    dx !== 0 ? w / 2 / Math.abs(dx) : Infinity,
    dy !== 0 ? h / 2 / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function ListeningEdgeComponent({ id, source, target, data }: EdgeProps) {
  const edgeData = (data ?? {}) as ListeningEdgeData;
  const stroke = edgeData.isError ? STROKE_ERROR : STROKE;

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const firstSeen = edgeData.firstSeen ?? 0;
  const arrivalIndex = edgeData.index ?? 0;
  const totalDelayMs =
    ANIM_DELAY_MS + Math.min(arrivalIndex, STAGGER_CAP_INDEX) * STAGGER_MS;
  const computeProgress = () => {
    const elapsed = Date.now() - firstSeen - totalDelayMs;
    return Math.max(0, Math.min(1, elapsed / ANIM_DURATION_MS));
  };
  const [progress, setProgress] = useState(computeProgress);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (progress >= 1) return;
    const tick = () => {
      const p = computeProgress();
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSeen]);

  if (!sourceNode || !targetNode) return null;

  const srcCenter = nodeCenter(sourceNode);
  const tgtCenter = nodeCenter(targetNode);
  const sourceEdge = rectIntersection(sourceNode, tgtCenter);
  const targetEdge = rectIntersection(targetNode, srcCenter);

  const dx = targetEdge.x - sourceEdge.x;
  const dy = targetEdge.y - sourceEdge.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = sourceEdge.x;
  const sy = sourceEdge.y;
  const tx = targetEdge.x - ux * ARROW_CLEARANCE;
  const ty = targetEdge.y - uy * ARROW_CLEARANCE;

  const [path, labelX, labelY] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  const dashOffset = 1500 * (1 - progress);
  const opacity = Math.min(1, progress * 5);
  const markerId = `trace-arrow-${id}`;

  return (
    <>
      <g className="cm-focus-edge-group" style={{ color: stroke }}>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            markerWidth="9"
            markerHeight="9"
            refX="10"
            refY="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
          </marker>
        </defs>
        <path
          id={id}
          d={path}
          className="cm-focus-edge-path react-flow__edge-path"
          fill="none"
          markerEnd={`url(#${markerId})`}
          style={{
            stroke,
            strokeWidth: edgeData.isError ? 2.5 : 2,
            strokeDasharray: "1500",
            strokeDashoffset: dashOffset,
            opacity,
          }}
        />
      </g>
      {progress > 0.4 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              opacity,
            }}
          >
            <span
              className="rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-white shadow-sm"
              style={{ backgroundColor: stroke }}
            >
              llama
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ListeningEdge = memo(ListeningEdgeComponent);
