"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Globe, Radio } from "lucide-react";
import type { ClassNode } from "@/lib/trace";
import { useListeningStore } from "@/store/listeningStore";

export interface ListeningNodeData extends Record<string, unknown> {
  node: ClassNode;
  isCenter: boolean;
}

/**
 * "Escuchando" node — visual sibling of {@link FocusCenterNode} but fed by live
 * trace data instead of static analysis, and fully self-contained (no
 * graphStore coupling). Center node is the entry class; peripherals are the
 * classes reached as execution flows outward. Errors paint the node red.
 */
function ListeningNodeComponent({ data }: NodeProps) {
  const { node, isCenter } = data as ListeningNodeData;
  const selectError = useListeningStore((s) => s.selectError);
  const isError = node.status === "ERROR";

  // Re-pulse when a repeat call lands on this class (hitCount climbs). CSS
  // animations only run on mount, so we toggle the class off→on around a tick.
  const [pulsing, setPulsing] = useState(false);
  const prevHits = useRef(node.hitCount);
  useEffect(() => {
    if (node.hitCount > prevHits.current) {
      prevHits.current = node.hitCount;
      setPulsing(false);
      const raf = requestAnimationFrame(() => setPulsing(true));
      const done = setTimeout(() => setPulsing(false), 1150);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(done);
      };
    }
    prevHits.current = node.hitCount;
  }, [node.hitCount]);

  const width = isCenter ? 320 : 220;

  // Border / glow: bordó normally (heavier for the center), red when errored.
  const borderColor = isError ? "#DC2626" : "var(--bordo)";
  const glow = isError
    ? undefined // handled by the breathing .cm-trace-error animation
    : isCenter
      ? "0 0 28px rgba(185,28,66,0.55), 0 0 56px rgba(185,28,66,0.22), var(--shadow-md)"
      : "0 0 16px rgba(185,28,66,0.28), var(--shadow-sm)";

  const maxPills = isCenter ? 10 : 6;
  const pills = node.methods.slice(0, maxPills);
  const overflow = node.methods.length - pills.length;

  return (
    <div
      // cm-focus-node-enter = the existing 840ms scale-in entrance (stagger
      // delay set inline by the layout). cm-trace-pulse re-fires via the React
      // key on the wrapper when a repeat call arrives. cm-trace-error replaces
      // the static glow with a red breathing pulse.
      className={`cm-focus-node-enter relative flex flex-col overflow-hidden rounded-lg bg-[var(--bg-card)] text-[var(--fg-primary)] ${
        isCenter ? "border-2" : "border"
      } ${isError ? "cm-trace-error" : pulsing ? "cm-trace-pulse" : ""}`}
      style={{ width, borderColor, boxShadow: glow }}
    >
      {/* Floating edges read node centers, but ReactFlow still wants handles to
          exist for source/target wiring. All invisible, all sides. */}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-white"
        style={{ background: isError ? "#DC2626" : "var(--bordo)" }}
      >
        {/* Execution-order badge — the call sequence number (1 → 2 → 3 …). */}
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 font-mono text-[11px] font-bold tabular-nums ring-1 ring-white/40"
          title={`Orden de ejecución: ${node.order}`}
        >
          {node.order}
        </span>
        {isError ? (
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        ) : node.isHttp ? (
          <Globe className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        ) : (
          <Radio className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        )}
        <span className="truncate text-sm font-semibold">{node.className}</span>
        {isCenter && (
          <span className="ml-auto rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]">
            Entrada
          </span>
        )}
        {!isCenter && node.hitCount > 1 && (
          <span
            className="ml-auto rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] tabular-nums"
            title={`${node.hitCount} llamadas`}
          >
            ×{node.hitCount}
          </span>
        )}
      </div>

      {/* Method pills — appear as methods are observed, like FocusCenterNode. */}
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-2">
          {pills.map((m) => (
            <span
              key={m}
              className="rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--bordo)]"
              title={`${m}()`}
            >
              {m}()
            </span>
          ))}
          {overflow > 0 && (
            <span className="rounded-sm border border-[var(--border-silver)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--silver-mid)]">
              +{overflow}
            </span>
          )}
        </div>
      )}

      {/* Error footer — click opens the side panel with the full stacktrace. */}
      {isError ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            selectError(node.className);
          }}
          className="flex items-center gap-1.5 bg-[#DC2626]/15 px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-[#FCA5A5] transition-colors hover:bg-[#DC2626]/25"
          title="Ver detalle de la excepción"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {node.error?.type ?? "Excepción"} — ver detalle
          </span>
        </button>
      ) : node.isHttp ? (
        <div className="truncate bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
          petición HTTP (entrada)
        </div>
      ) : (
        <div className="truncate bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          {node.fqcn
            ? node.fqcn.slice(0, node.fqcn.lastIndexOf(".")) || "(sin paquete)"
            : "(sin paquete)"}
        </div>
      )}
    </div>
  );
}

export const ListeningNode = memo(ListeningNodeComponent);
