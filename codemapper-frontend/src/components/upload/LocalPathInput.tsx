"use client";

import { useState } from "react";
import { HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeLocalPath } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function LocalPathInput() {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);

  const onAnalyze = async () => {
    if (!path.trim()) {
      toast.error("Ingresá una ruta local");
      return;
    }
    setBusy(true);
    try {
      const res = await analyzeLocalPath(path.trim());
      router.push(`/map/${res.sessionId}`);
    } catch {
      // toast handled
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2 transition-colors focus-within:border-[var(--bordo)] focus-within:shadow-[0_0_16px_rgba(185,28,66,0.25)]">
        <HardDrive className="h-4 w-4 text-[var(--silver-dark)]" />
        <Input
          type="text"
          placeholder="C:\Users\ariel\Reserva\backend-reserva"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAnalyze();
          }}
          className="border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      <p className="text-xs text-[var(--fg-muted)]">
        Solo desarrollo local. La ruta se lee directamente desde el backend.
      </p>

      <Button
        onClick={onAnalyze}
        disabled={!path.trim() || busy}
        size="lg"
        className="bg-[var(--bordo)] uppercase tracking-[0.16em] text-white shadow-[0_0_24px_rgba(185,28,66,0.35)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_28px_rgba(185,28,66,0.55)] disabled:bg-[var(--bg-panel)] disabled:text-[var(--fg-muted)] disabled:shadow-none"
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Analizando...
          </>
        ) : (
          "Analizar"
        )}
      </Button>
    </div>
  );
}
