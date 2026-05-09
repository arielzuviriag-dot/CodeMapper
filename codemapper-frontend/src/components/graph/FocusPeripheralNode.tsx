"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  AlertTriangle,
  Box,
  CircleDashed,
  CircleDot,
  FileCode,
  GitBranch,
  RefreshCw,
  Shapes,
  Shield,
  Triangle,
} from "lucide-react";
import type {
  ClassKind,
  ControlContext,
  FocusConnectionPayload,
  FocusConnectionType,
} from "@/lib/types";

interface PeripheralData extends Record<string, unknown> {
  payload: FocusConnectionPayload;
}

const TYPE_THEME: Record<FocusConnectionType, { bg: string; fg: string; label: string }> = {
  CALLS: { bg: "#B91C42", fg: "#FFFFFF", label: "Llama a" },
  CALLED_BY: { bg: "#5C0A1A", fg: "#FFFFFF", label: "Llamado por" },
  EXTENDS: { bg: "#C0C0C8", fg: "#0A0A0A", label: "Extiende" },
  IMPLEMENTS: { bg: "#A8A8B0", fg: "#0A0A0A", label: "Implementa" },
  USES_PROPERTIES: { bg: "#8B0F2A", fg: "#FFFFFF", label: "Usa props" },
  INVOKES_METHOD: { bg: "#5C0A1A", fg: "#FFFFFF", label: "Invocado" },
  INVOKES_OUTGOING: { bg: "#B91C42", fg: "#FFFFFF", label: "Invoca" },
};

const CONTROL_THEME: Record<
  ControlContext,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  IF_THEN: { label: "if (true)", icon: Triangle },
  IF_ELSE: { label: "if (false)", icon: Triangle },
  LOOP: { label: "loop", icon: RefreshCw },
  TRY: { label: "try", icon: Shield },
  CATCH: { label: "catch", icon: AlertTriangle },
  SWITCH_CASE: { label: "switch", icon: GitBranch },
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
  const { payload } = data as PeripheralData;
  const theme = TYPE_THEME[payload.connectionType];
  const isProperties = payload.connectionType === "USES_PROPERTIES";

  const controlTheme = payload.controlContext
    ? CONTROL_THEME[payload.controlContext]
    : null;
  const ControlIcon = controlTheme?.icon;
  // Subline showing which method on the source side originates the link, or
  // (for outgoing method-focus calls) which method is invoked on the target.
  const ct = payload.connectionType;
  let viaText: string | null = null;
  if (ct === "INVOKES_OUTGOING" && payload.viaMethodInTarget) {
    viaText = `${payload.viaMethodInTarget}()`;
  } else if (ct === "INVOKES_METHOD" && payload.viaMethodInSource) {
    viaText = `desde ${payload.viaMethodInSource}()`;
  } else if (ct === "CALLED_BY" || ct === "CALLS") {
    // "via import" fallback for callers detected via their import statement
    // when no specific method could be linked (dead imports / hard-to-resolve
    // expressions). For CALLS we leave it null since we control the focus
    // side and a missing method there is a real bug, not a dead import.
    viaText = payload.viaMethodInSource
      ? `via ${payload.viaMethodInSource}()`
      : ct === "CALLED_BY"
        ? "via import"
        : null;
  }

  return (
    // Pure-CSS entrance via .cm-focus-node-enter — runs once per mount with
    // `forwards`, so re-renders triggered by layout rebalance don't restart
    // the animation (which is what made framer-motion leave nodes invisible
    // while the matching edge already pointed at them).
    <div
      className="cm-focus-node-enter relative flex w-[220px] flex-col overflow-hidden rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] text-[var(--fg-primary)] shadow-[var(--shadow-md)]"
    >
      <Handle type="target" id="tgt-top" position={Position.Top} className="!opacity-0" />
      <Handle type="target" id="tgt-bottom" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" id="tgt-left" position={Position.Left} className="!opacity-0" />
      <Handle type="target" id="tgt-right" position={Position.Right} className="!opacity-0" />

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
        {controlTheme && ControlIcon ? (
          <span className="ml-auto flex items-center gap-1 rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.14em]">
            <ControlIcon className="h-2.5 w-2.5" />
            {controlTheme.label}
          </span>
        ) : null}
      </div>

      {/* name + annotations */}
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{payload.name}</span>
        </div>
        {viaText ? (
          <div className="truncate font-mono text-[10px] text-[var(--bordo)]">
            {viaText}
          </div>
        ) : null}
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
    </div>
  );
}

export const FocusPeripheralNode = memo(FocusPeripheralNodeComponent);
