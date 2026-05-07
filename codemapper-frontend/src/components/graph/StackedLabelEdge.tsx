"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";

interface StackedEdgeData extends Record<string, unknown> {
  /** 0-based position among edges sharing the same (source, target). */
  siblingIndex: number;
  /** Total edges between this pair (for the perpendicular offset math). */
  siblingCount: number;
  accent?: string;
}

/** Distance in px between adjacent parallel curves. Increase if labels still
 *  feel cramped or decrease for a tighter stack. */
const SIBLING_SPACING = 32;

/**
 * Edge whose path bows perpendicularly to its straight line — when several
 * edges share the same (source, target), each one curves in a different
 * direction so the lines don't lie on top of each other. The label rides
 * the apex of the curve, so labels separate naturally with the lines.
 */
function StackedLabelEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const ed = (data ?? {}) as StackedEdgeData;
  const siblingIndex = ed.siblingIndex ?? 0;
  const siblingCount = Math.max(ed.siblingCount ?? 1, 1);

  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  // Symmetric offset around 0 so the family of curves is balanced:
  //   N=1 → [0]
  //   N=2 → [-S/2, +S/2]
  //   N=3 → [-S, 0, +S]
  const offset =
    siblingCount > 1
      ? (siblingIndex - (siblingCount - 1) / 2) * SIBLING_SPACING
      : 0;

  // Perpendicular unit vector to (target - source). For a near-horizontal
  // edge (dy small) the offset is mostly vertical; for vertical layouts it's
  // mostly horizontal. Falls back to a small downward push if the two ends
  // collapse to a single point (shouldn't happen but defensive).
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;

  const ctrlX = midX + px * offset;
  const ctrlY = midY + py * offset;

  // Quadratic Bézier through the offset control point — straight line when
  // offset=0, gentle bow otherwise.
  const path = `M ${sourceX},${sourceY} Q ${ctrlX},${ctrlY} ${targetX},${targetY}`;

  // The Bézier midpoint sits at t=0.5: P = ¼ S + ½ C + ¼ T. That's a clean
  // place to drop the label — it tracks the curve apex.
  const labelX = sourceX * 0.25 + ctrlX * 0.5 + targetX * 0.25;
  const labelY = sourceY * 0.25 + ctrlY * 0.5 + targetY * 0.25;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="rounded-sm border border-[var(--border-silver)] bg-[var(--bg-base)]/90 px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-tight text-[var(--silver-mid)]"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const StackedLabelEdge = memo(StackedLabelEdgeComponent);
