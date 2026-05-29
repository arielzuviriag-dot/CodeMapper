"use client";

import { useState } from "react";
import { Bug, Folder, Loader2, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { analyzeException, persistDemoMode, resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface ExceptionInputProps {
  /** TEMPORAL — fuerza modo PRO sin tocar la URL (igual que FocusInput). */
  forcePro?: boolean;
}

/**
 * Ariadna — paste a Java stack trace + the project it came from, and the app
 * builds a class map focused on where the error was actually thrown (the root
 * cause), with the full call chain around it. 100% deterministic: the chain
 * and the line numbers come straight from the trace.
 */
export function ExceptionInput({ forcePro = false }: ExceptionInputProps = {}) {
  const router = useRouter();
  const [projectPath, setProjectPath] = useState("");
  const [mobilePath, setMobilePath] = useState("");
  const [stackTrace, setStackTrace] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const trimmedProject = projectPath.trim();
  const trimmedTrace = stackTrace.trim();
  const canSubmit = trimmedProject.length > 0 && trimmedTrace.length > 0;

  const onAnalyze = async () => {
    if (!trimmedProject) {
      toast.error("Ingresá la ruta del proyecto");
      return;
    }
    if (!trimmedTrace) {
      toast.error("Pegá el stack trace de la excepción");
      return;
    }
    if (isAnalyzing) return;

    setIsAnalyzing(true);
    if (forcePro) persistDemoMode("pro");
    const demoMode = forcePro ? "pro" : resolveDemoMode();
    const promise = analyzeException({
      projectPath: trimmedProject,
      stackTrace: trimmedTrace,
      mobilePath: mobilePath.trim() || undefined,
      demoMode,
    });
    useGraphStore.getState().setPendingAnalysis({
      promise,
      description: "Investigando la excepción...",
      mode: "exception",
      demo: demoMode === "pro" ? "pro" : undefined,
      projectPath: trimmedProject,
    });
    const params = new URLSearchParams({ mode: "exception" });
    if (demoMode === "pro") params.set("demo", "pro");
    router.push(`/map/pending?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-panel)]/40 px-3 py-2.5 text-xs leading-relaxed text-[var(--fg-secondary)]">
        Pegá una excepción (o una cadena de <span className="font-mono">Caused by</span>)
        y la ruta del proyecto. Armamos el mapa de clases enfocado en{" "}
        <span className="text-[var(--bordo)]">dónde se lanzó el error</span> y te
        mostramos el camino completo que llevó hasta ahí.
      </p>

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
          <Smartphone className="h-4 w-4 shrink-0 text-[var(--silver-dark)]" />
          <Input
            type="text"
            placeholder="C:\Users\tu-usuario\proyectos\mi-app-mobile (React Native, opcional)"
            value={mobilePath}
            onChange={(e) => setMobilePath(e.target.value)}
            disabled={isAnalyzing}
            className="border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <p className="px-1 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
          Opcional — si lo cargás, linkeamos la pantalla mobile que dispara el endpoint
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <textarea
          placeholder={
            "Pegá acá el stack trace, por ejemplo:\n\njava.lang.NullPointerException: ...\n    at com.empresa.service.MiServicio.metodo(MiServicio.java:42)\n    at ..."
          }
          value={stackTrace}
          onChange={(e) => setStackTrace(e.target.value)}
          disabled={isAnalyzing}
          rows={9}
          spellCheck={false}
          className="min-h-[180px] w-full resize-y rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2.5 font-mono text-xs leading-relaxed text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] transition-colors focus:border-[var(--bordo)] focus:shadow-[0_0_16px_rgba(185,28,66,0.25)] focus:outline-none"
        />
        <p className="px-1 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
          Pegá el trace tal cual — toleramos prefijos de log, &ldquo;... N more&rdquo; y Caused by
        </p>
      </div>

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
            Investigando...
          </>
        ) : forcePro ? (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Investigar excepción PRO
          </>
        ) : (
          <>
            <Bug className="mr-2 h-4 w-4" />
            Investigar excepción
          </>
        )}
      </Button>
    </div>
  );
}
