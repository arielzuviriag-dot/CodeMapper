"use client";

import { motion } from "framer-motion";
import { Crosshair, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmation step before firing FOCO SCANER from a connection-class
 * sheet. Shown ONLY for re-analyses initiated from the sheet — the home
 * page's first analysis still runs without confirmation.
 */
export function FocusScanConfirmModal({
  open,
  targetLabel,
  isPro,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Class name (or "Class.method()") that will become the new focus. */
  targetLabel: string;
  isPro: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        className="cm-hairline-top w-[min(480px,92vw)] max-w-[480px] overflow-hidden border border-[var(--bordo)]/40 bg-[var(--bg-panel)] p-0 sm:rounded-xl"
        style={{ boxShadow: "var(--shadow-xl)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative px-7 py-7"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(ellipse at top, rgba(185,28,66,0.16) 0%, transparent 65%)",
            }}
          />

          <div className="relative flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--bordo)] bg-[var(--bordo)]/10 shadow-[0_0_18px_rgba(185,28,66,0.4)]">
                <Crosshair className="h-4 w-4 text-[var(--bordo)]" strokeWidth={2.2} />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="truncate text-base font-semibold text-[var(--fg-primary)]">
                  Análisis FOCO de{" "}
                  <span className="text-[var(--bordo)]">{targetLabel}</span>
                </DialogTitle>
              </div>
            </div>

            <DialogDescription className="text-sm leading-relaxed text-[var(--fg-secondary)]">
              Vas a realizar un análisis FOCO sobre esta clase. Se rastrearán
              las conexiones de Nivel 1.
            </DialogDescription>

            <div
              className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2"
              style={{ background: "rgba(15,15,15,0.7)" }}
            >
              {isPro ? (
                <p className="font-mono text-[11px] leading-snug text-[var(--silver-mid)]">
                  <span className="font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
                    Versión PRO activa
                  </span>{" "}
                  — sin límite de conexiones.
                </p>
              ) : (
                <p className="font-mono text-[11px] leading-snug text-[var(--silver-mid)]">
                  <span className="font-semibold uppercase tracking-[0.18em] text-[var(--silver)]">
                    Versión Free
                  </span>{" "}
                  — solo verás hasta{" "}
                  <span className="text-[var(--bordo)]">10 conexiones directas</span>.
                  Versión PRO te muestra toda la cadena.
                </p>
              )}
            </div>

            <div className="mt-1 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--silver)] hover:bg-[var(--bg-card)] hover:text-[var(--fg-primary)]"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={onConfirm}
                className="bg-[var(--bordo)] font-mono text-xs uppercase tracking-[0.16em] text-white shadow-[0_0_18px_rgba(185,28,66,0.4)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_24px_rgba(185,28,66,0.6)]"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Aceptar y analizar
              </Button>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
