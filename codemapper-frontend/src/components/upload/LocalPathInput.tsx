"use client";

import { useState } from "react";
import { HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { analyzeLocalPath, resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function LocalPathInput() {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const onAnalyze = async () => {
    if (!path.trim()) {
      toast.error("Ingresá una ruta local");
      return;
    }
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    const demoMode = resolveDemoMode();
    const trimmed = path.trim();
    let sessionId: string;
    try {
      const res = await analyzeLocalPath(trimmed, demoMode);
      sessionId = res.sessionId;
    } catch {
      // toast handled by interceptor — allow retry
      setIsAnalyzing(false);
      return;
    }
    // Persist for the FOCO SCANER button on the map page (it needs the
    // absolute project path to compute relative focus file paths).
    useGraphStore.getState().setProjectPath(trimmed);
    const suffix = demoMode === "pro" ? "?demo=pro" : "";
    router.push(`/map/${sessionId}${suffix}`);
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
          disabled={isAnalyzing}
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
        disabled={!path.trim() || isAnalyzing}
        size="lg"
        className={cn(
          "uppercase tracking-[0.16em] text-white",
          isAnalyzing
            ? "cursor-wait bg-[var(--bordo)] opacity-70 shadow-[0_0_12px_rgba(185,28,66,0.18)] hover:bg-[var(--bordo)] disabled:bg-[var(--bordo)] disabled:text-white disabled:opacity-70"
            : "bg-[var(--bordo)] shadow-[0_0_24px_rgba(185,28,66,0.35)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_28px_rgba(185,28,66,0.55)] disabled:bg-[var(--bg-panel)] disabled:text-[var(--fg-muted)] disabled:shadow-none",
        )}
      >
        {isAnalyzing ? (
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
