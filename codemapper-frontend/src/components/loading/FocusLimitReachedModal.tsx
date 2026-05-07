"use client";

import { motion } from "framer-motion";
import { Crosshair, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGraphStore } from "@/store/graphStore";

/**
 * Specialized modal for FOCUS mode. Educates the user on what
 * level-1 means and what the PRO version unlocks (full dependency
 * chain down to the database).
 */
export function FocusLimitReachedModal() {
  const limit = useGraphStore((s) => s.limitReached);
  const dismiss = useGraphStore((s) => s.dismissLimitReached);

  const onNotifyMe = () => {
    toast.success("Te avisaremos cuando salga PRO");
    dismiss();
  };

  return (
    <Dialog open={limit.modalOpen} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent
        className="cm-hairline-top w-[min(580px,92vw)] max-w-[580px] overflow-hidden border border-[var(--border-silver)] bg-[var(--bg-card)] p-0 sm:rounded-xl"
        style={{ boxShadow: "var(--shadow-xl)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative px-8 py-9"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse at top, rgba(185,28,66,0.18) 0%, transparent 60%)",
            }}
          />

          <div className="relative flex flex-col items-center gap-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--bordo)] bg-[var(--bordo)]/10 shadow-[0_0_24px_rgba(185,28,66,0.45)]">
              <Crosshair className="h-6 w-6 text-[var(--bordo)]" strokeWidth={1.7} />
            </div>

            <DialogTitle
              className="text-2xl font-semibold tracking-tight text-[var(--fg-primary)] sm:text-3xl"
              style={{
                textShadow:
                  "0 0 24px rgba(185,28,66,0.55), 0 0 48px rgba(185,28,66,0.25)",
              }}
            >
              Modo FOCO — Nivel 1
            </DialogTitle>

            <DialogDescription className="text-sm text-[var(--fg-secondary)] sm:text-base">
              Estamos mostrando solo las{" "}
              <span className="font-mono tabular-nums text-[var(--bordo)]">
                {limit.parsed}
              </span>{" "}
              conexiones directas{" "}
              <span className="text-[var(--silver)]">(Nivel 1)</span> de tu
              archivo. Hay{" "}
              <span className="font-mono tabular-nums text-[var(--silver)]">
                {Math.max(limit.totalAvailable - limit.parsed, 0)}
              </span>{" "}
              más en este proyecto.
            </DialogDescription>

            <div className="flex w-full flex-col gap-2 rounded-lg border border-[var(--bordo)]/30 bg-[var(--bordo)]/8 p-4 text-left text-sm text-[var(--fg-secondary)]"
              style={{ background: "rgba(185,28,66,0.06)" }}
            >
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--bordo)]">
                Versión PRO
              </span>
              <span className="text-[var(--fg-primary)]">
                Te muestra <strong>toda la cadena</strong> de dependencias —
                Service → Repository → Entity → tabla en la base de datos.
              </span>
            </div>

            <div className="mt-1 flex w-full flex-col gap-3">
              <Button
                onClick={onNotifyMe}
                size="lg"
                className="bg-[var(--bordo)] uppercase tracking-[0.16em] text-white shadow-[0_0_24px_rgba(185,28,66,0.45)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_32px_rgba(185,28,66,0.6)]"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Quiero ver toda la cadena con PRO
              </Button>

              <Button
                onClick={dismiss}
                variant="outline"
                size="lg"
                className="border-[var(--border-silver)] bg-transparent uppercase tracking-[0.14em] text-[var(--silver)] hover:border-[var(--silver)] hover:bg-[var(--bg-panel)] hover:text-[var(--fg-primary)]"
              >
                Continuar con Nivel 1
              </Button>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
