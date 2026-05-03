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
      <div className="flex items-center gap-2">
        <HardDrive className="h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="C:\Users\ariel\Reserva\backend-reserva"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAnalyze();
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Solo desarrollo local. La ruta se lee directamente desde el backend.
      </p>

      <Button onClick={onAnalyze} disabled={!path.trim() || busy} size="lg">
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
