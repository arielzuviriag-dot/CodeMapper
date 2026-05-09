"use client";

import { memo, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Crosshair } from "lucide-react";
import type { FocusClassLoadedPayload } from "@/lib/types";
import { useGraphStore } from "@/store/graphStore";
import { BehaviorChipBar } from "./BehaviorChipBar";

interface CenterData extends Record<string, unknown> {
  focus: FocusClassLoadedPayload;
  /** F4 — true when an impact report is active AND it detected a cycle that
   *  loops back through the focus. Drives the pulsing red ring around the
   *  card. False or absent in normal viewing. */
  hasCycles?: boolean;
}

function FocusCenterNodeComponent({ data }: NodeProps) {
  const { focus, hasCycles } = data as CenterData;

  // Collapse all `throws` declarations into a single deduplicated cluster.
  // The cluster surfaces which exceptions can leak out of this class as a
  // whole — useful contract info that wouldn't fit in the sidebar's per-method
  // list. The full method listing lives in the left sidebar (FocusMethodsBlock)
  // and stays unrestricted regardless of plan.
  const exceptions = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const m of focus.methods) {
      for (const ex of m.thrownExceptions ?? []) {
        if (ex && ex.trim()) set.add(ex.trim());
      }
    }
    return Array.from(set);
  }, [focus.methods]);

  return (
    // Pure-CSS entrance via .cm-focus-node-enter (300ms, runs once at mount).
    // No framer-motion: re-renders triggered by the radial layout rebalance
    // would otherwise restart the entrance animation each time.
    <div
      className="cm-focus-node-enter relative flex w-[340px] flex-col overflow-hidden rounded-lg border-2 border-[var(--bordo)] bg-[var(--bg-card)] text-[var(--fg-primary)]"
      style={{
        boxShadow:
          "0 0 28px rgba(185,28,66,0.55), 0 0 56px rgba(185,28,66,0.22), var(--shadow-md)",
      }}
    >
      {/* F4 — cycle ring overlay when the impact report flagged hasCycles.
          Sits outside the card via inset:-22px to be unmistakable. */}
      {hasCycles && <div className="cm-impact-cycle-ring" aria-hidden />}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="target" position={Position.Right} className="!opacity-0" />
      <Handle type="source" position={Position.Top} id="src-top" className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} id="src-bottom" className="!opacity-0" />
      <Handle type="source" position={Position.Left} id="src-left" className="!opacity-0" />
      <Handle type="source" position={Position.Right} id="src-right" className="!opacity-0" />

      {/* Header — bordó with FOCO badge + optional Jacoco coverage donut */}
      <div className="flex items-center gap-2 bg-[var(--bordo)] px-3 py-2 text-white">
        <Crosshair className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span className="truncate text-sm font-semibold">{focus.name}</span>
        {typeof focus.coveragePercent === "number" && (
          <CoverageDonut
            percent={focus.coveragePercent}
            onClick={(e) => {
              e.stopPropagation();
              // Click → open the class sheet; the sheet's "Cobertura" tab
              // will show the per-method breakdown when available.
              useGraphStore.getState().selectNode(focus.id);
            }}
          />
        )}
        <span className="ml-auto rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]">
          Foco
        </span>
      </div>

      {/* Class-level annotations — kept as-is from the original design */}
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

      {/* F2 — behavior chips bar (Spring/JSR runtime annotations). The
          component itself returns null when there are none, so no need to
          guard here against empty arrays. */}
      <BehaviorChipBar focus={focus} />

      {/* Exception cluster — only when at least one method declares throws.
          Per the compat rule, we never render an empty section. */}
      {exceptions.length > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
            <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--bordo)]" strokeWidth={2.2} />
            <span>Excepciones</span>
            <span className="ml-auto font-mono tabular-nums text-[var(--silver)]">
              {exceptions.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {exceptions.map((ex) => (
              <span
                key={ex}
                className="rounded-sm border border-[var(--bordo)]/30 bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--bordo)]"
                title={ex}
              >
                {ex}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer with package name */}
      <div className="truncate bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {focus.packageName || "(sin paquete)"}
      </div>
    </div>
  );
}

export const FocusCenterNode = memo(FocusCenterNodeComponent);

/** F3 — small SVG donut that surfaces the focus class's Jacoco LINE coverage.
 *  Color coded: green ≥ 80, amber ≥ 50, red < 50. Click delegates to the
 *  parent so the host can route to the coverage sheet tab. */
function CoverageDonut({
  percent,
  onClick,
}: {
  percent: number;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const ringColor =
    clamped >= 80 ? "#4ADE80" : clamped >= 50 ? "#FBBF24" : "#F87171";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Cobertura Jacoco: ${clamped.toFixed(0)}% — click para detalle`}
      aria-label={`Cobertura ${clamped.toFixed(0)} por ciento`}
      className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/25 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
    >
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="3"
        />
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
        />
        <text
          x="14"
          y="15"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontFamily="ui-monospace, monospace"
          fontSize="8"
          fontWeight="700"
        >
          {clamped.toFixed(0)}
        </text>
      </svg>
    </button>
  );
}
