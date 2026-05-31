"use client";

import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useIaGrafoStore } from "@/store/iaGrafoStore";
import { setApiKey } from "@/lib/iaGrafo";

/**
 * "Conectar con Claude" — popup para pegar la API key de Anthropic. La key se
 * guarda server-side (cookie httpOnly) y nunca toca el browser. Aparece cuando
 * no hay key cargada; el chat queda detrás bloqueado hasta conectar.
 */
export function IaKeyGate() {
  const hasKey = useIaGrafoStore((s) => s.hasKey);
  const setHasKey = useIaGrafoStore((s) => s.setHasKey);
  const manualMode = useIaGrafoStore((s) => s.manualMode);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  const onConnect = async () => {
    if (saving) return;
    const trimmed = key.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      toast.error("La API key debería empezar con sk-ant-");
      return;
    }
    setSaving(true);
    try {
      const ok = await setApiKey(trimmed);
      if (ok) {
        setHasKey(true);
        setKey("");
        toast.success("Cuenta conectada");
      } else {
        toast.error("No se pudo guardar la key");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!hasKey && !manualMode}>
      <DialogContent className="border-[var(--border-silver)] bg-[var(--bg-card)] sm:max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
            <KeyRound className="h-5 w-5 text-[var(--bordo)]" />
            Conectar con Claude
          </DialogTitle>
          <DialogDescription className="text-[var(--silver-dark)]">
            Pegá tu API key de Anthropic (de{" "}
            <span className="font-mono text-[var(--silver)]">platform.claude.com → API Keys</span>).
            El uso se factura a esa cuenta de la Console (aparte de la suscripción).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <input
            type="password"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onConnect()}
            placeholder="sk-ant-..."
            className="w-full rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2 font-mono text-sm text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:border-[var(--bordo)] focus:outline-none"
          />
          <Button
            onClick={onConnect}
            disabled={saving}
            className="gap-2 bg-[var(--bordo)] text-white hover:bg-[var(--bordo-mid)]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Conectar
          </Button>
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-[var(--silver-dark)]">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#0F9D58]" />
            La key se guarda en una cookie httpOnly del servidor — no queda en el
            navegador ni en el código del front.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
