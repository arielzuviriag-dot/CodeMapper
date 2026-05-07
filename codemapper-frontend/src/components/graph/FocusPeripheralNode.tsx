"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Box, CircleDashed, CircleDot, FileCode, Shapes } from "lucide-react";
import type {
  ClassKind,
  FocusConnectionPayload,
  FocusConnectionType,
} from "@/lib/types";

interface PeripheralData extends Record<string, unknown> {
  payload: FocusConnectionPayload;
  /** 0-based index in the arrival order. Drives stagger delay. */
  index: number;
}

const STAGGER_S = 0.5;
/** Wait for the center node entrance (0.6s) before starting peripherals. */
const BASE_DELAY_S = 0.6;

const TYPE_THEME: Record<FocusConnectionType, { bg: string; fg: string; label: string }> = {
  CALLS: { bg: "#B91C42", fg: "#FFFFFF", label: "Llama a" },
  CALLED_BY: { bg: "#5C0A1A", fg: "#FFFFFF", label: "Llamado por" },
  EXTENDS: { bg: "#C0C0C8", fg: "#0A0A0A", label: "Extiende" },
  IMPLEMENTS: { bg: "#A8A8B0", fg: "#0A0A0A", label: "Implementa" },
  USES_PROPERTIES: { bg: "#8B0F2A", fg: "#FFFFFF", label: "Usa props" },
};

function KindIcon({ kind }: { kind: ClassKind }) {
  switch (kind) {
    case "INTERFACE":
      return <CircleDashed className="h-3.5 w-3.5" />;
    case "ENUM":
      return <Shapes className="h-3.5 w-3.5" />;
    case "RECORD":
      return <CircleDot className="h-3.5 w-3.5" />;
    default:
      return <Box className="h-3.5 w-3.5" />;
  }
}

function FocusPeripheralNodeComponent({ data }: NodeProps) {
  const { payload, index } = data as PeripheralData;
  const theme = TYPE_THEME[payload.connectionType];
  const isProperties = payload.connectionType === "USES_PROPERTIES";

  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
        delay: BASE_DELAY_S + index * STAGGER_S,
      }}
      className="relative flex w-[220px] flex-col overflow-hidden rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] text-[var(--fg-primary)] shadow-[var(--shadow-md)]"
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="target" position={Position.Right} className="!opacity-0" />

      {/* connection-type ribbon */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em]"
        style={{ backgroundColor: theme.bg, color: theme.fg }}
      >
        {isProperties ? (
          <FileCode className="h-3 w-3" />
        ) : (
          <KindIcon kind={payload.type} />
        )}
        <span className="truncate">{theme.label}</span>
      </div>

      {/* name + annotations */}
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{payload.name}</span>
        </div>
        {payload.annotations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {payload.annotations.slice(0, 3).map((a, i) => (
              <span
                key={`${a}-${i}`}
                className="rounded-sm border border-[var(--bordo)]/30 bg-[var(--bordo)]/10 px-1 py-0.5 font-mono text-[9px] font-medium tracking-tight text-[var(--bordo)]"
              >
                {a.startsWith("@") ? a : `@${a}`}
              </span>
            ))}
            {payload.annotations.length > 3 && (
              <span className="rounded-sm border border-[var(--border-silver)] bg-[var(--bg-input)] px-1 py-0.5 text-[9px] text-[var(--fg-muted)]">
                +{payload.annotations.length - 3}
              </span>
            )}
          </div>
        )}

        {!isProperties && (
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
            <span>
              <span className="tabular-nums text-[var(--silver)]">
                {payload.fields.length}
              </span>{" "}
              campos
            </span>
            <span>
              <span className="tabular-nums text-[var(--silver)]">
                {payload.methods.length}
              </span>{" "}
              métodos
            </span>
          </div>
        )}
      </div>

      <div className="truncate border-t border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {payload.packageName || "(sin paquete)"}
      </div>
    </motion.div>
  );
}

export const FocusPeripheralNode = memo(FocusPeripheralNodeComponent);
