"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Crosshair, FileCode2, Folder, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnalysisLoadingScreen } from "@/components/loading/AnalysisLoadingScreen";
import { cn } from "@/lib/utils";
import { analyzeFocus, resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const NAVIGATE_DELAY_MS = 200;

export function FocusInput() {
  const router = useRouter();
  const [projectPath, setProjectPath] = useState("");
  const [focusFile, setFocusFile] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  const trimmedProject = projectPath.trim();
  const trimmedFocus = focusFile.trim();
  const isFocusJava = trimmedFocus.endsWith(".java");
  const canSubmit = trimmedProject.length > 0 && trimmedFocus.length > 0 && isFocusJava;

  const onAnalyze = async () => {
    if (!trimmedProject) {
      toast.error("Ingresá la ruta del proyecto");
      return;
    }
    if (!trimmedFocus) {
      toast.error("Ingresá el path del archivo .java de inicio");
      return;
    }
    if (!isFocusJava) {
      toast.error("El archivo de inicio debe terminar en .java");
      return;
    }
    if (isAnalyzing) return;

    setIsAnalyzing(true);
    const demoMode = resolveDemoMode();
    let sessionId: string;
    try {
      const res = await analyzeFocus({
        projectPath: trimmedProject,
        focusFile: trimmedFocus,
        demoMode,
      });
      sessionId = res.sessionId;
    } catch {
      // toast already shown by interceptor
      setIsAnalyzing(false);
      return;
    }
    // Persist for the FOCO SCANER button on the map page (it needs the
    // absolute project path to compute relative focus file paths).
    useGraphStore.getState().setProjectPath(trimmedProject);
    setShowOverlay(true);
    const params = new URLSearchParams({ mode: "focus" });
    if (demoMode === "pro") params.set("demo", "pro");
    setTimeout(
      () => router.push(`/map/${sessionId}?${params.toString()}`),
      NAVIGATE_DELAY_MS,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2 transition-colors focus-within:border-[var(--bordo)] focus-within:shadow-[0_0_16px_rgba(185,28,66,0.25)]">
        <Folder className="h-4 w-4 shrink-0 text-[var(--silver-dark)]" />
        <Input
          type="text"
          placeholder="C:\Users\tu-usuario\proyectos\mi-proyecto"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          disabled={isAnalyzing}
          className="border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2 transition-colors focus-within:border-[var(--bordo)] focus-within:shadow-[0_0_16px_rgba(185,28,66,0.25)]">
          <FileCode2 className="h-4 w-4 shrink-0 text-[var(--silver-dark)]" />
          <Input
            type="text"
            placeholder="src/main/java/com/empresa/UserService.java"
            value={focusFile}
            onChange={(e) => setFocusFile(e.target.value)}
            disabled={isAnalyzing}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) onAnalyze();
            }}
            className="border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <p className="px-1 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
          Path relativo al proyecto, terminado en .java
        </p>
      </div>

      <p className="text-xs text-[var(--fg-muted)]">
        Modo FOCO: rastreamos las dependencias directas (nivel 1) del archivo elegido.
      </p>

      <Button
        onClick={onAnalyze}
        disabled={!canSubmit || isAnalyzing}
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
          <>
            <Crosshair className="mr-2 h-4 w-4" />
            Analizar FOCO
          </>
        )}
      </Button>

      <AnimatePresence>
        {showOverlay && <AnalysisLoadingScreen />}
      </AnimatePresence>
    </div>
  );
}
