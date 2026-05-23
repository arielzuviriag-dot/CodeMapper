"use client";

import { ArrowLeftToLine, ArrowRightFromLine, Sparkles } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";

type DirectionOption = {
  id: "all" | "incoming" | "outgoing";
  label: string;
  testId: string;
  Icon: typeof ArrowLeftToLine;
};

const OPTIONS: DirectionOption[] = [
  { id: "all", label: "Todo", testId: "focus-direction-all", Icon: Sparkles },
  { id: "incoming", label: "Entra", testId: "focus-direction-incoming", Icon: ArrowLeftToLine },
  { id: "outgoing", label: "Sale", testId: "focus-direction-outgoing", Icon: ArrowRightFromLine },
];

/**
 * P2 — segmented control that filters the focus radial graph by direction.
 *
 *  - "Todo" (default) → no extra mask; the per-type checkboxes in the
 *    FocusConnectionLegend still apply.
 *  - "← Entra" → only connection types where the peripheral points at the
 *    focus (CALLED_BY, INVOKES_METHOD, EXTENDS, IMPLEMENTS).
 *  - "Sale →" → only types where the focus points out (CALLS,
 *    INVOKES_OUTGOING, USES_PROPERTIES).
 *
 * Lives above the graph, next to ImpactSimulationButton, so the user can
 * reach it without opening the legend. Combines as an INTERSECTION with the
 * existing per-type / per-class-kind filters.
 */
export function FocusDirectionFilter() {
  const value = useGraphStore((s) => s.focusDirectionFilter);
  const setValue = useGraphStore((s) => s.setFocusDirectionFilter);

  return (
    <div
      role="group"
      aria-label="Filtro direccional"
      data-testid="focus-direction-filter"
      className="flex items-center gap-1 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-md)]"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        const Icon = opt.Icon;
        return (
          <button
            key={opt.id}
            type="button"
            data-testid={opt.testId}
            aria-pressed={active}
            onClick={() => setValue(opt.id)}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60 ${
              active
                ? "bg-[var(--bordo)] text-white shadow-[0_0_12px_rgba(185,28,66,0.45)]"
                : "bg-transparent text-[var(--silver)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
            }`}
          >
            {opt.id === "incoming" && <ArrowLeftToLine className="h-3 w-3" aria-hidden />}
            {opt.id === "outgoing" ? null : opt.id === "all" ? (
              <Icon className="h-3 w-3" aria-hidden />
            ) : null}
            <span>{opt.label}</span>
            {opt.id === "outgoing" && <ArrowRightFromLine className="h-3 w-3" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
