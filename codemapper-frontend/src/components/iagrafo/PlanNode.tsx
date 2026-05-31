"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Crosshair, FlaskConical, PhoneIncoming, Settings, Boxes } from "lucide-react";
import type { PlanNode as PlanNodeT, PlanNodeRole } from "@/lib/iaGrafo";

export interface PlanNodeData extends Record<string, unknown> {
  node: PlanNodeT;
  selected: boolean;
}

const ROLE_META: Record<
  PlanNodeRole,
  { color: string; label: string; Icon: typeof Crosshair }
> = {
  objetivo: { color: "#B91C42", label: "Objetivo", Icon: Crosshair },
  caller: { color: "#2F81F7", label: "Lo llama", Icon: PhoneIncoming },
  dependencia: { color: "#A8A8B0", label: "Dependencia", Icon: Boxes },
  test: { color: "#0F9D58", label: "Test", Icon: FlaskConical },
  config: { color: "#D9A441", label: "Config", Icon: Settings },
};

/**
 * Card del grafo IA.Grafo — un lugar que el cambio va a tocar. El color/ícono
 * vienen del rol (objetivo / caller / dependencia / test / config). Click abre
 * el código en la línea del cambio (lo maneja el grafo, no el nodo).
 */
function PlanNodeComponent({ data }: NodeProps) {
  const { node, selected } = data as PlanNodeData;
  const meta = ROLE_META[node.role] ?? ROLE_META.dependencia;
  const { Icon } = meta;

  return (
    <div
      className="relative flex w-[260px] cursor-pointer flex-col overflow-hidden rounded-lg border bg-[var(--bg-card)] text-[var(--fg-primary)] transition-shadow"
      style={{
        borderColor: meta.color,
        borderWidth: node.role === "objetivo" ? 2 : 1,
        boxShadow: selected
          ? `0 0 0 2px ${meta.color}, 0 0 22px ${meta.color}66`
          : `0 0 14px ${meta.color}33, var(--shadow-sm)`,
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />

      <div
        className="flex items-center gap-2 px-3 py-2 text-white"
        style={{ background: meta.color }}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span className="truncate text-sm font-semibold">{node.label}</span>
        <span className="ml-auto shrink-0 rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]">
          {meta.label}
        </span>
      </div>

      {node.summary && (
        <div className="border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-2 text-[11px] leading-snug text-[var(--silver)]">
          {node.summary}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[10px] text-[var(--silver-dark)]">
        <span className="truncate" title={node.file}>
          {node.file ?? node.fqcn ?? node.id}
        </span>
        {node.anchorLine != null && (
          <span className="shrink-0 rounded-[3px] bg-[var(--bordo)]/15 px-1 text-[var(--bordo)]">
            L{node.anchorLine}
          </span>
        )}
      </div>
    </div>
  );
}

export const PlanNode = memo(PlanNodeComponent);
