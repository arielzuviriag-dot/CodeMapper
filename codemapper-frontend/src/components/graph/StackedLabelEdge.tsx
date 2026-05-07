"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

interface StackedEdgeData extends Record<string, unknown> {
  /** 0-based position among edges sharing the same (source, target). */
  siblingIndex: number;
  /** Total edges between this pair (for vertical stacking math). */
  siblingCount: number;
  /** Optional CSS color for the label badge border (matches edge stroke). */
  accent?: string;
}

const LABEL_ROW_HEIGHT = 18;

/**
 * Smoothstep edge whose label is rendered as an HTML pill via
 * EdgeLabelRenderer. When two or more edges share endpoints, each label
 * is stacked vertically around the midpoint so they don't overlap. The
 * default reactflow built-in edges drop all labels at the midpoint and
 * collide visually.
 */
function StackedLabelEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const ed = (data ?? {}) as StackedEdgeData;
  const siblingIndex = ed.siblingIndex ?? 0;
  const siblingCount = Math.max(ed.siblingCount ?? 1, 1);

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Center the stack on the midpoint: row 0 of N is at offset
  //   (0 - (N-1)/2) * H  →  for N=2: -H/2 and +H/2
  //                         for N=3: -H, 0, +H
  const offsetY =
    siblingCount > 1
      ? (siblingIndex - (siblingCount - 1) / 2) * LABEL_ROW_HEIGHT
      : 0;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + offsetY}px)`,
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
