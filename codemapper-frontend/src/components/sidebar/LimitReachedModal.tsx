"use client";

import { motion } from "framer-motion";
import { Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGraphStore } from "@/store/graphStore";

export function LimitReachedModal() {
  const limit = useGraphStore((s) => s.limitReached);
  const dismiss = useGraphStore((s) => s.dismissLimitReached);

  const onNotifyMe = () => {
    toast.success("Te avisaremos cuando salga PRO");
    dismiss();
  };

  return (
    <Dialog open={limit.modalOpen} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent
        className="cm-hairline-top w-[min(540px,92vw)] max-w-[540px] overflow-hidden border border-[var(--border-silver)] bg-[var(--bg-card)] p-0 sm:rounded-xl"
        style={{ boxShadow: "var(--shadow-xl)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative px-8 py-9"
        >
          {/* Faint bordó radial wash inside the modal */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse at top, rgba(185,28,66,0.18) 0%, transparent 60%)",
            }}
          />

          <div className="relative flex flex-col items-center gap-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--bordo)] bg-[var(--bordo)]/10 shadow-[0_0_24px_rgba(185,28,66,0.45)]">
              <Lock className="h-6 w-6 text-[var(--bordo)]" strokeWidth={1.5} />
            </div>

            <DialogTitle
              className="text-3xl font-semibold tracking-tight text-[var(--fg-primary)] sm:text-4xl"
              style={{
                textShadow:
                  "0 0 24px rgba(185,28,66,0.55), 0 0 48px rgba(185,28,66,0.25)",
              }}
            >
              Llegaste al límite FREE
            </DialogTitle>

            <DialogDescription className="text-base text-[var(--fg-secondary)]">
              Estás viendo{" "}
              <span className="font-mono tabular-nums text-[var(--silver)]">
                {limit.parsed}
              </span>{" "}
              de{" "}
              <span className="font-mono tabular-nums text-[var(--silver)]">
                {limit.totalAvailable}
              </span>{" "}
              archivos del proyecto
            </DialogDescription>

            <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
              Versión PRO sin límites — próximamente
            </p>

            <div className="mt-2 flex w-full flex-col gap-3">
              <Button
                onClick={onNotifyMe}
                size="lg"
                className="bg-[var(--bordo)] uppercase tracking-[0.16em] text-white shadow-[0_0_24px_rgba(185,28,66,0.45)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_32px_rgba(185,28,66,0.6)]"
              >
                <Mail className="mr-2 h-4 w-4" />
                Quiero ser notificado del lanzamiento PRO
              </Button>

              <Button
                onClick={dismiss}
                variant="outline"
                size="lg"
                className="border-[var(--border-silver)] bg-transparent uppercase tracking-[0.14em] text-[var(--silver)] hover:border-[var(--silver)] hover:bg-[var(--bg-panel)] hover:text-[var(--fg-primary)]"
              >
                Continuar viendo lo disponible
              </Button>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
