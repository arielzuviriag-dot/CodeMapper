"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Crosshair } from "lucide-react";
import type { FocusMethodLoadedPayload } from "@/lib/types";

interface CenterData extends Record<string, unknown> {
  focus: FocusMethodLoadedPayload;
}

function FocusMethodCenterNodeComponent({ data }: NodeProps) {
  const { focus } = data as CenterData;
  const params = focus.parameters
    .map((p) => `${p.type} ${p.name}`)
    .join(", ");

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex w-[320px] flex-col overflow-hidden rounded-lg border-2 border-[var(--bordo)] bg-[var(--bg-card)] text-[var(--fg-primary)]"
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

      {/* Header */}
      <div className="flex items-center gap-2 bg-[var(--bordo)] px-3 py-2 text-white">
        <Crosshair className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span className="truncate font-mono text-sm font-semibold">
          {focus.containingClass}.{focus.methodName}()
        </span>
        <span className="ml-auto rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]">
          Foco método
        </span>
      </div>

      {/* Signature row */}
      <div className="border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-2 font-mono text-[10px] leading-snug text-[var(--silver)]">
        <span className="text-[var(--silver-dark)]">params:</span>{" "}
        <span className="text-[var(--fg-primary)]">{params || "()"}</span>
        <span className="mx-1.5 text-[var(--silver-dark)]">·</span>
        <span className="text-[var(--silver-dark)]">retorna:</span>{" "}
        <span className="text-[var(--bordo)]">{focus.returnType}</span>
      </div>

      {/* Footer with package */}
      <div className="truncate bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {focus.containingClassPackage || "(sin paquete)"}
      </div>
    </motion.div>
  );
}

export const FocusMethodCenterNode = memo(FocusMethodCenterNodeComponent);
