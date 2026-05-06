"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnalysisLoadingScreen } from "@/components/loading/AnalysisLoadingScreen";
import { cn } from "@/lib/utils";
import { analyzeGithub, resolveDemoMode } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const NAVIGATE_DELAY_MS = 200;

export function GitHubInput() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  const onAnalyze = async () => {
    if (!url.trim()) {
      toast.error("Ingresá una URL de GitHub");
      return;
    }
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    const demoMode = resolveDemoMode();
    let sessionId: string;
    try {
      const res = await analyzeGithub(url.trim(), demoMode);
      sessionId = res.sessionId;
    } catch {
      // toast handled by interceptor — allow retry
      setIsAnalyzing(false);
      return;
    }
    setShowOverlay(true);
    const suffix = demoMode === "pro" ? "?demo=pro" : "";
    setTimeout(() => router.push(`/map/${sessionId}${suffix}`), NAVIGATE_DELAY_MS);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2 transition-colors focus-within:border-[var(--bordo)] focus-within:shadow-[0_0_16px_rgba(185,28,66,0.25)]">
        <Github className="h-4 w-4 text-[var(--silver-dark)]" />
        <Input
          type="url"
          placeholder="https://github.com/usuario/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isAnalyzing}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAnalyze();
          }}
          className="border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      <p className="text-xs text-[var(--fg-muted)]">
        Solo repositorios públicos. Se clona y analiza en el servidor.
      </p>

      <Button
        onClick={onAnalyze}
        disabled={!url.trim() || isAnalyzing}
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

      <AnimatePresence>
        {showOverlay && <AnalysisLoadingScreen />}
      </AnimatePresence>
    </div>
  );
}
