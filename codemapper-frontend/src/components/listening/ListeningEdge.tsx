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
  /** Methods invoked on the target via this call. */
  methods?: string[];
  /** How many times this call happened (source → target). */
  count?: number;
  /** True when target also calls source back ("va y vuelve"). */
  bidirectional?: boolean;
}

const STROKE = "#B91C42";
const STROKE_ERROR = "#DC2626";
const ARROW_CLEARANCE = 4;
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

function ListeningEdgeComponent({ id, source, target, data, style }: EdgeProps) {
  const edgeData = (data ?? {}) as ListeningEdgeData;
  // Highlight (from useGraphInteraction on double-click) arrives via `style`.
  const hl = (style ?? {}) as React.CSSProperties;
  const highlighted = hl.stroke != null;
  const dimmed = !highlighted && hl.opacity != null && Number(hl.opacity) < 1;
  const stroke =
    (hl.stroke as string) ?? (edgeData.isError ? STROKE_ERROR : STROKE);
  const strokeWidth = hl.strokeWidth != null
    ? Number(hl.strokeWidth)
    : edgeData.isError
      ? 2.5
      : 2;
  const styleOpacity = hl.opacity != null ? Number(hl.opacity) : 1;

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

  // Dash length = el largo REAL del trazo, no un valor fijo. Si fuera fijo (ej.
  // 1500), al separar las cards la línea supera ese largo y el sobrante cae en
  // el "gap" del patrón → la línea no llega a la card aunque la flecha sí. Con
  // el largo real, el guion cubre siempre toda la línea sin importar el espaseo.
  const pathLen = Math.max(1, Math.hypot(tx - sx, ty - sy));
  const dashOffset = pathLen * (1 - progress);
  const opacity = Math.min(1, progress * 5);
  const markerId = `trace-arrow-${id}`;

  // Label = the method(s) invoked on the target (up to 2), or "llama" when the
  // agent didn't report a code.function for the call.
  const methods = edgeData.methods ?? [];
  const labelText =
    methods.length === 0
      ? "llama"
      : methods.slice(0, 2).join(", ") + (methods.length > 2 ? "…" : "");

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
            strokeWidth,
            strokeDasharray: pathLen,
            strokeDashoffset: dashOffset,
            opacity: opacity * styleOpacity,
            filter: highlighted ? (hl.filter as string) : undefined,
          }}
        />
      </g>
      {progress > 0.4 && !dimmed && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              opacity: opacity * styleOpacity,
            }}
          >
            <span
              className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-semibold leading-none text-white shadow-sm"
              style={{ backgroundColor: stroke }}
            >
              {edgeData.bidirectional && <span title="se llaman mutuamente">⇄</span>}
              <span>{labelText}</span>
              {(edgeData.count ?? 0) > 1 && (
                <span
                  className="rounded-[3px] bg-white/25 px-1"
                  title="número de llamadas entre estas clases"
                >
                  ×{edgeData.count}
                </span>
              )}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ListeningEdge = memo(ListeningEdgeComponent);
