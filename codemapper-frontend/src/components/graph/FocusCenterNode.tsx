"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Crosshair } from "lucide-react";
import type { FocusClassLoadedPayload } from "@/lib/types";

interface CenterData extends Record<string, unknown> {
  focus: FocusClassLoadedPayload;
}

const FIELD_STAGGER_S = 0.2;

function FocusCenterNodeComponent({ data }: NodeProps) {
  // [debug] flagging while we stabilise focus mode — remove once stable
  console.log("[CodeMapper] FocusCenterNode render, data:", data);
  const { focus } = data as CenterData;
  const fields = focus.fields ?? [];
  const methods = focus.methods ?? [];

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex w-[400px] flex-col overflow-hidden rounded-xl border-2 border-[var(--bordo)] bg-[var(--bg-card)] text-[var(--fg-primary)]"
      style={{
        boxShadow:
          "0 0 32px rgba(185,28,66,0.55), 0 0 64px rgba(185,28,66,0.25), var(--shadow-lg)",
      }}
    >
      {/* invisible handles so edges can connect on every side */}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="target" position={Position.Right} className="!opacity-0" />
      <Handle type="source" position={Position.Top} id="src-top" className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} id="src-bottom" className="!opacity-0" />
      <Handle type="source" position={Position.Left} id="src-left" className="!opacity-0" />
      <Handle type="source" position={Position.Right} id="src-right" className="!opacity-0" />

      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-[var(--bordo)]/40 bg-[var(--bordo)] px-4 py-3 text-white">
        <Crosshair className="h-4 w-4" strokeWidth={2.2} />
        <span className="text-base font-semibold tracking-tight">{focus.name}</span>
        <span className="ml-auto rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]">
          Foco
        </span>
      </div>

      {/* Annotations */}
      {focus.annotations.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-4 py-2">
          {focus.annotations.slice(0, 6).map((a, i) => (
            <span
              key={`${a}-${i}`}
              className="rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--bordo)]"
            >
              {a.startsWith("@") ? a : `@${a}`}
            </span>
          ))}
        </div>
      )}

      {/* VARIABLES */}
      <div className="flex flex-col gap-2 px-4 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--silver-dark)]">
          Variables{" "}
          <span className="text-[var(--silver)] tabular-nums">
            ({fields.length})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {fields.length === 0 && (
            <span className="text-xs text-[var(--fg-muted)]">— sin variables</span>
          )}
          {fields.map((f, i) => (
            <motion.span
              key={`${f.name}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: 0.6 + i * FIELD_STAGGER_S,
              }}
              className="rounded-md border border-[var(--bordo)]/50 bg-[var(--bordo)]/8 px-2 py-1 font-mono text-[11px] text-[var(--fg-primary)]"
              style={{ background: "rgba(185,28,66,0.08)" }}
            >
              <span className="text-[var(--fg-muted)]">{f.type}</span>{" "}
              <span className="font-semibold">{f.name}</span>
            </motion.span>
          ))}
        </div>
      </div>

      {/* METHODS */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--silver-dark)]">
          Métodos{" "}
          <span className="text-[var(--silver)] tabular-nums">
            ({methods.length})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {methods.length === 0 && (
            <span className="text-xs text-[var(--fg-muted)]">— sin métodos</span>
          )}
          {methods.map((m, i) => (
            <span
              key={`${m.name}-${i}`}
              className="rounded-md border border-[var(--silver)]/30 bg-[var(--bg-input)] px-2 py-1 font-mono text-[11px] text-[var(--silver)]"
            >
              {m.name}
              <span className="text-[var(--fg-muted)]">()</span>
            </span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="truncate border-t border-[var(--border-silver)] bg-[var(--bg-input)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
        {focus.packageName || "(sin paquete)"}
      </div>
    </motion.div>
  );
}

export const FocusCenterNode = memo(FocusCenterNodeComponent);
