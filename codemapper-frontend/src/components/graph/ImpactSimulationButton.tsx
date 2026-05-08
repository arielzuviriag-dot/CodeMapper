"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon, Loader2, Zap, ZapOff } from "lucide-react";
import { toast } from "sonner";
import { getImpactReport } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";

/**
 * F4 entry point. Two states:
 *
 * <ul>
 *   <li><b>Idle</b>: rounded "Simular cambio" button. Click → POST impact,
 *   show loader, then transition to active.</li>
 *   <li><b>Active</b>: a banner that replaces the button — shows the impact
 *   counter ("Cambia este Java impacta: N archivos · M tests"), the cycle
 *   warning if any, and a dismiss action that clears the overlay.</li>
 * </ul>
 *
 * Same view for FREE and PRO — the plan rule is "only quantity is gated".
 * The graph's 10-peripheral cap upstream is what differentiates plans;
 * here, every dev sees the full impact counter and overlay highlights.
 */
export function ImpactSimulationButton() {
  const sessionId = useGraphStore((s) => s.sessionId);
  const impactReport = useGraphStore((s) => s.impactReport);
  const impactLoading = useGraphStore((s) => s.impactLoading);
  const setImpactReport = useGraphStore((s) => s.setImpactReport);
  const setImpactLoading = useGraphStore((s) => s.setImpactLoading);
  const [error, setError] = useState<string | null>(null);

  const onSimulate = async () => {
    if (!sessionId) {
      toast.error("Sesión no disponible — recargá la página");
      return;
    }
    setError(null);
    setImpactLoading(true);
    try {
      const report = await getImpactReport(sessionId, 4);
      setImpactReport(report);
      if (report.totalImpact === 0) {
        toast.message("Esta clase no tiene callers", {
          description: "Cambiarla no afecta a nadie en el proyecto.",
        });
      }
    } catch (e) {
      console.error("[CodeMapper] impact request failed", e);
      setError("No se pudo calcular el impacto");
    } finally {
      setImpactLoading(false);
    }
  };

  const onDismiss = () => {
    setImpactReport(null);
  };

  if (impactReport) {
    return (
      <ImpactBanner
        totalImpact={impactReport.totalImpact}
        totalTests={impactReport.totalTests}
        hasCycles={impactReport.hasCycles}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onSimulate}
      disabled={impactLoading || !sessionId}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-2 rounded-md border border-[var(--bordo)]/60 bg-[var(--bordo)]/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--bordo)] shadow-[var(--shadow-md)] transition-colors hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/20 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
      title="Calcular el impacto transitivo de cambiar esta clase"
    >
      {impactLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Zap className="h-4 w-4" strokeWidth={2.4} />
      )}
      <span className="font-semibold">
        {impactLoading ? "Calculando..." : "Simular cambio"}
      </span>
      {error && (
        <span className="ml-1 text-[9px] normal-case opacity-80">— {error}</span>
      )}
    </motion.button>
  );
}

/**
 * Active-state banner. Replaces the button while an impact report is loaded.
 * Shows the counter, the cycle warning, and a dismiss action.
 */
function ImpactBanner({
  totalImpact,
  totalTests,
  hasCycles,
  onDismiss,
}: {
  totalImpact: number;
  totalTests: number;
  hasCycles: boolean;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.96 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-2 rounded-md border border-[var(--bordo)] bg-[var(--bordo)]/15 px-3 py-2 shadow-[0_0_18px_rgba(185,28,66,0.35)]"
      >
        <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--fg-primary)]">
          <Zap
            className="h-4 w-4 shrink-0 text-[var(--bordo)]"
            strokeWidth={2.4}
          />
          <span className="font-semibold uppercase tracking-[0.16em] text-[var(--bordo)]">
            Impacto
          </span>
        </div>
        <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-snug text-[var(--fg-primary)]">
          <span>
            <span className="text-2xl font-bold tabular-nums text-[var(--bordo)]">
              {totalImpact}
            </span>{" "}
            <span className="text-[var(--silver)]">archivos afectados</span>
          </span>
          <span>
            <span className="text-base font-semibold tabular-nums text-[var(--silver)]">
              {totalTests}
            </span>{" "}
            <span className="text-[var(--silver-dark)]">tests</span>
          </span>
        </div>
        {hasCycles && (
          <div className="flex items-center gap-1.5 rounded-sm border border-red-500/50 bg-red-500/10 px-2 py-1 font-mono text-[10px] text-red-400">
            <AlertOctagon className="h-3 w-3 shrink-0" />
            <span className="font-semibold uppercase tracking-[0.14em]">
              Acoplamiento cíclico
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="flex items-center justify-center gap-1.5 rounded-sm border border-[var(--border-silver)] bg-[var(--bg-card)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver)] transition-colors hover:border-[var(--bordo)] hover:text-[var(--bordo)]"
        >
          <ZapOff className="h-3 w-3" />
          Salir del modo simular
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
