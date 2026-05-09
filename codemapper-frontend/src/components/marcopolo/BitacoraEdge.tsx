"use client";

import { memo, useState } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

interface BitacoraEdgeData extends Record<string, unknown> {
  fromMethod: string | null;
  toMethod: string | null;
  isLatest: boolean;
  /** 0-based index of THIS edge among the parallel edges connecting the
   *  same source/target pair. Drives the per-edge curvature offset so
   *  multiple jumps between the same two classes don't overlap. */
  parallelIndex: number;
  /** Total parallel edges between this source/target pair. Used together
   *  with parallelIndex to spread the offsets symmetrically around the
   *  straight line. */
  parallelCount: number;
  /** Click handler — wired to the panel so the host can react (load that
   *  class as the new focus, or set it as active). */
  onSelect: () => void;
}

/** Truncate a method name to 12 chars + ellipsis, matching the spec. */
function shortMethod(name: string): string {
  return name.length > 12 ? name.slice(0, 11) + "…" : name;
}

/** Compose the label text. Hidden when both sides are null. */
function buildLabel(
  fromMethod: string | null,
  toMethod: string | null,
  expanded: boolean,
): string | null {
  if (!fromMethod && !toMethod) return null;
  const left = fromMethod ? (expanded ? fromMethod : shortMethod(fromMethod)) + "()" : "";
  const right = toMethod ? (expanded ? toMethod : shortMethod(toMethod)) + "()" : "";
  if (!left) return right;
  if (!right) return left;
  return `${left} → ${right}`;
}

/**
 * Custom edge for the bitácora tree. Bezier curve with:
 *  • Per-edge curvature offset so parallel jumps between the same two
 *    classes spread out instead of stacking on the same path.
 *  • Centered label rendering the method context (`fromMethod() → toMethod()`).
 *    Hidden entirely when both methods are null.
 *  • Saturated stroke + drop-shadow for the latest jump; faded stroke for
 *    older ones, so the user can read "this is the most recent move".
 *  • Click on the edge selects the destination — the host decides what to
 *    do with that (load class as new focus, jump active pointer, etc).
 */
function BitacoraEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as BitacoraEdgeData;
  const { fromMethod, toMethod, isLatest, parallelIndex, parallelCount, onSelect } =
    edgeData;
  const [hovered, setHovered] = useState(false);

  // Spread parallel edges symmetrically around the straight midpoint. Index
  // 0 stays centered (curvature 0.25 default), each subsequent edge alternates
  // sides with growing magnitude. Single edge: no offset.
  const parallelOffset =
    parallelCount > 1
      ? ((parallelIndex - (parallelCount - 1) / 2) * 0.35) // tunable spread
      : 0;
  const curvature = 0.25 + parallelOffset;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  });

  const stroke = isLatest ? "#B91C42" : "#7E7E86";
  const strokeOpacity = isLatest ? 1 : 0.6;
  const filter = isLatest ? "drop-shadow(0 0 4px rgba(185,28,66,0.55))" : "none";
  const labelText = buildLabel(fromMethod, toMethod, hovered);

  const markerId = `bitacora-arrow-${id}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          markerWidth="8"
          markerHeight="8"
          refX="9"
          refY="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} opacity={strokeOpacity} />
        </marker>
      </defs>

      <g
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.();
        }}
        style={{ cursor: "pointer" }}
      >
        {/* Wide invisible hit area so the label/edge respond to hover even
            when the user isn't pixel-perfect on the 1.5px stroke. */}
        <path d={path} stroke="transparent" strokeWidth={14} fill="none" />
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={1.5}
          markerEnd={`url(#${markerId})`}
          style={{ filter, transition: "stroke 200ms ease, opacity 200ms ease" }}
        />
      </g>

      {labelText && (
        <EdgeLabelRenderer>
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "auto",
              cursor: "pointer",
            }}
            className="rounded-sm border border-[var(--border-silver)] bg-[var(--bg-base)]/90 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-[var(--silver)] shadow-sm transition-colors hover:border-[var(--bordo)] hover:text-[var(--bordo)]"
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const BitacoraEdge = memo(BitacoraEdgeComponent);
