"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { Crosshair, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Confirmation step before firing FOCO SCANER from a connection-class
 * sheet. Shown ONLY for re-analyses initiated from the sheet — the home
 * page's first analysis still runs without confirmation.
 *
 * Centered via a fixed full-viewport flex wrapper (NOT the
 * `top-1/2 left-1/2 translate(-50%, -50%)` pattern) so an ancestor with
 * `transform` (sheet slide animations create one transiently) can't shift
 * the modal off-center.
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
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="cm-hairline-top relative w-[min(480px,92vw)] overflow-hidden rounded-xl border border-[var(--bordo)]/40 bg-[var(--bg-panel)] px-7 py-7 shadow-[var(--shadow-xl,0_25px_60px_rgba(0,0,0,0.7))]"
          >
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="absolute right-3 top-3 rounded-sm text-[var(--silver-dark)] opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

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
                  <Crosshair
                    className="h-4 w-4 text-[var(--bordo)]"
                    strokeWidth={2.2}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <DialogPrimitive.Title className="truncate text-base font-semibold text-[var(--fg-primary)]">
                    Análisis FOCO de{" "}
                    <span className="text-[var(--bordo)]">{targetLabel}</span>
                  </DialogPrimitive.Title>
                </div>
              </div>

              <DialogPrimitive.Description className="text-sm leading-relaxed text-[var(--fg-secondary)]">
                Vas a realizar un análisis FOCO sobre esta clase. Se rastrearán
                las conexiones de Nivel 1.
              </DialogPrimitive.Description>

              <div
                className="rounded-md border border-[var(--border-silver)] px-3 py-2"
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
                    <span className="text-[var(--bordo)]">
                      10 conexiones directas
                    </span>
                    . Versión PRO te muestra toda la cadena.
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
