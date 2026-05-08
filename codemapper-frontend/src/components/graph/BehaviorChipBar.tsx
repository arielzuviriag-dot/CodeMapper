"use client";

import { type MouseEvent as ReactMouseEvent } from "react";
import {
  Database,
  Layers,
  Repeat,
  Timer,
  Zap,
  Bell,
  Shield,
  HelpCircle,
} from "lucide-react";
import type { BehaviorChip, FocusClassLoadedPayload } from "@/lib/types";
import { useGraphStore } from "@/store/graphStore";

interface Props {
  focus: FocusClassLoadedPayload;
}

/** Per-annotation visual theme. Color carries the semantic group at a glance:
 *  blue = transactions, violet = caching, amber = async/scheduled, etc. */
const CHIP_THEME: Record<
  string,
  { bg: string; fg: string; border: string; Icon: typeof Database }
> = {
  "@Transactional": {
    bg: "rgba(59,130,246,0.10)",
    fg: "#60A5FA",
    border: "rgba(59,130,246,0.40)",
    Icon: Database,
  },
  "@Cacheable": {
    bg: "rgba(168,85,247,0.10)",
    fg: "#C084FC",
    border: "rgba(168,85,247,0.40)",
    Icon: Layers,
  },
  "@CacheEvict": {
    bg: "rgba(168,85,247,0.10)",
    fg: "#C084FC",
    border: "rgba(168,85,247,0.40)",
    Icon: Layers,
  },
  "@CachePut": {
    bg: "rgba(168,85,247,0.10)",
    fg: "#C084FC",
    border: "rgba(168,85,247,0.40)",
    Icon: Layers,
  },
  "@Caching": {
    bg: "rgba(168,85,247,0.10)",
    fg: "#C084FC",
    border: "rgba(168,85,247,0.40)",
    Icon: Layers,
  },
  "@Async": {
    bg: "rgba(245,158,11,0.10)",
    fg: "#FBBF24",
    border: "rgba(245,158,11,0.40)",
    Icon: Zap,
  },
  "@Scheduled": {
    bg: "rgba(245,158,11,0.10)",
    fg: "#FBBF24",
    border: "rgba(245,158,11,0.40)",
    Icon: Timer,
  },
  "@EventListener": {
    bg: "rgba(34,197,94,0.10)",
    fg: "#4ADE80",
    border: "rgba(34,197,94,0.40)",
    Icon: Bell,
  },
  "@TransactionalEventListener": {
    bg: "rgba(34,197,94,0.10)",
    fg: "#4ADE80",
    border: "rgba(34,197,94,0.40)",
    Icon: Bell,
  },
  "@Retryable": {
    bg: "rgba(236,72,153,0.10)",
    fg: "#F472B6",
    border: "rgba(236,72,153,0.40)",
    Icon: Repeat,
  },
  "@Recover": {
    bg: "rgba(236,72,153,0.10)",
    fg: "#F472B6",
    border: "rgba(236,72,153,0.40)",
    Icon: Repeat,
  },
  "@Lock": {
    bg: "rgba(192,192,200,0.10)",
    fg: "#C0C0C8",
    border: "rgba(192,192,200,0.40)",
    Icon: Shield,
  },
};

const FALLBACK_THEME = {
  bg: "rgba(192,192,200,0.10)",
  fg: "#C0C0C8",
  border: "rgba(192,192,200,0.40)",
  Icon: HelpCircle,
};

/**
 * Horizontal scrollable bar of behavioral annotation chips. Click a chip to
 * navigate to the owning method (or the class file when the annotation is at
 * class level). Hidden when the class declares zero — silence over noise.
 *
 * No FREE/PRO cap here — these chips are interior info of the focus class
 * (they're already in the AST). The plan rule: only the graph's level-1
 * peripheral count is gated by plan. Anything intrinsic to the focus shows
 * fully in both plans.
 */
export function BehaviorChipBar({ focus }: Props) {
  const openMethodSheet = useGraphStore((s) => s.openMethodSheet);
  const selectNode = useGraphStore((s) => s.selectNode);

  const all = focus.behaviorAnnotations ?? [];
  if (all.length === 0) return null;

  const handleChipClick = (chip: BehaviorChip, e: ReactMouseEvent) => {
    e.stopPropagation();
    if (chip.methodName) {
      const method = focus.methods.find((m) => m.name === chip.methodName);
      if (method) {
        openMethodSheet(focus.id, method);
        return;
      }
    }
    // Class-level annotation, or method not found: open the class sheet.
    selectNode(focus.id);
  };

  return (
    <div className="flex flex-col gap-1.5 border-b border-[var(--border-silver)] bg-[var(--bg-card)] px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
        <span>Comportamiento</span>
        <span className="font-mono tabular-nums text-[var(--silver)]">
          {all.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {all.map((chip, i) => {
          const theme = CHIP_THEME[chip.annotation] ?? FALLBACK_THEME;
          const { Icon } = theme;
          const labelSuffix = chip.value
            ? `(${truncateValue(chip.value)})`
            : "";
          const tooltip = chip.methodName
            ? `${chip.annotation}${labelSuffix} en ${chip.methodName}() — click para ver el método`
            : `${chip.annotation}${labelSuffix} a nivel clase — click para ver la clase`;
          return (
            <button
              key={`${chip.annotation}-${chip.methodName ?? "class"}-${i}`}
              type="button"
              onClick={(e) => handleChipClick(chip, e)}
              title={tooltip}
              className="flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] leading-tight transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
              style={{
                backgroundColor: theme.bg,
                color: theme.fg,
                borderColor: theme.border,
              }}
            >
              <Icon className="h-2.5 w-2.5 shrink-0" strokeWidth={2.4} />
              <span className="font-semibold">{chip.annotation}</span>
              {chip.value && (
                <span className="opacity-80">({truncateValue(chip.value)})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Trim long argument strings so chips don't blow up the layout. */
function truncateValue(v: string): string {
  if (v.length <= 16) return v;
  return v.slice(0, 14) + "…";
}
