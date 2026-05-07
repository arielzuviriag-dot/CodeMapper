"use client";

import { memo } from "react";
import { getStraightPath, type EdgeProps } from "@xyflow/react";
import type { FocusConnectionType } from "@/lib/types";

interface FocusEdgeData extends Record<string, unknown> {
  connectionType: FocusConnectionType;
  index: number;
}

const TYPE_STYLE: Record<
  FocusConnectionType,
  { stroke: string; width: number; dash?: string; label: string }
> = {
  CALLS: { stroke: "#B91C42", width: 2, label: "Llama a" },
  CALLED_BY: { stroke: "#5C0A1A", width: 2, label: "Llamado por" },
  EXTENDS: { stroke: "#C0C0C8", width: 2.5, label: "Extiende" },
  IMPLEMENTS: { stroke: "#C0C0C8", width: 1.75, dash: "6 5", label: "Implementa" },
  USES_PROPERTIES: { stroke: "#8B0F2A", width: 1.75, dash: "3 4", label: "Usa props" },
};

const STAGGER_S = 0.5;
const BASE_DELAY_S = 0.6;

function FocusEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as FocusEdgeData;
  const style = TYPE_STYLE[edgeData.connectionType] ?? TYPE_STYLE.CALLS;
  const [path, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });
  const delaySec = BASE_DELAY_S + (edgeData.index ?? 0) * STAGGER_S;

  return (
    <g
      className="cm-focus-edge-group"
      style={{
        color: style.stroke,
        ["--cm-focus-delay" as string]: `${delaySec}s`,
      }}
    >
      {/* Wide invisible hit area so the label/glow toggles on edge hover */}
      <path
        d={path}
        stroke="transparent"
        strokeWidth={20}
        fill="none"
        style={{ cursor: "pointer" }}
      />
      <path
        id={id}
        d={path}
        className="cm-focus-edge-path react-flow__edge-path"
        fill="none"
        style={{
          stroke: style.stroke,
          strokeWidth: style.width,
          strokeDasharray: style.dash ?? "1500",
        }}
      />
      <rect
        x={labelX - 44}
        y={labelY - 7}
        width={88}
        height={14}
        rx={3}
        ry={3}
        fill="#0A0A0A"
        fillOpacity={0.85}
        className="cm-focus-edge-label-bg"
      />
      <text
        x={labelX}
        y={labelY + 3}
        textAnchor="middle"
        className="cm-focus-edge-label"
      >
        {style.label.toUpperCase()}
      </text>
    </g>
  );
}

export const FocusEdge = memo(FocusEdgeComponent);
