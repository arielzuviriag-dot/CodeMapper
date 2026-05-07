"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Crosshair } from "lucide-react";
import type { FocusClassLoadedPayload } from "@/lib/types";

interface CenterData extends Record<string, unknown> {
  focus: FocusClassLoadedPayload;
}

function FocusCenterNodeComponent({ data }: NodeProps) {
  // [debug] flagging while we stabilise focus mode — remove once stable
  console.log("[CodeMapper] FocusCenterNode render, data:", data);
  const { focus } = data as CenterData;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex w-[280px] flex-col overflow-hidden rounded-lg border-2 border-[var(--bordo)] bg-[var(--bg-card)] text-[var(--fg-primary)]"
      style={{
        boxShadow:
          "0 0 28px rgba(185,28,66,0.55), 0 0 56px rgba(185,28,66,0.22), var(--shadow-md)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="target" position={Position.Right} className="!opacity-0" />
      <Handle type="source" position={Position.Top} id="src-top" className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} id="src-bottom" className="!opacity-0" />
      <Handle type="source" position={Position.Left} id="src-left" className="!opacity-0" />
      <Handle type="source" position={Position.Right} id="src-right" className="!opacity-0" />

      {/* Header — bordó with FOCO badge */}
      <div className="flex items-center gap-2 bg-[var(--bordo)] px-3 py-2 text-white">
        <Crosshair className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span className="truncate text-sm font-semibold">{focus.name}</span>
        <span className="ml-auto rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]">
          Foco
        </span>
      </div>

      {/* Annotations */}
      {focus.annotations.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-2">
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

      {/* Footer with package name */}
      <div className="truncate bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {focus.packageName || "(sin paquete)"}
      </div>
    </motion.div>
  );
}

export const FocusCenterNode = memo(FocusCenterNodeComponent);
