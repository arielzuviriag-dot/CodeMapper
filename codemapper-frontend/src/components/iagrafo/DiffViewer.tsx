"use client";

import { useState } from "react";
import { Check, FileDiff, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useIaGrafoStore } from "@/store/iaGrafoStore";
import { applyDiffs } from "@/lib/iaGrafo";

/**
 * Panel de cambios propuestos por la IA. Muestra cada diff (archivo + por qué +
 * antes/después) y permite APLICARLOS al working tree (determinista, sin
 * volver a llamar a Claude). Es la pata "aplicar" del flujo.
 */
export function DiffViewer() {
  const diffs = useIaGrafoStore((s) => s.diffs);
  const projectPath = useIaGrafoStore((s) => s.projectPath);
  const applying = useIaGrafoStore((s) => s.applying);
  const setApplying = useIaGrafoStore((s) => s.setApplying);
  const clearDiffs = useIaGrafoStore((s) => s.clearDiffs);
  const [applied, setApplied] = useState(false);

  if (diffs.length === 0) return null;

  const onApply = async () => {
    if (applying) return;
    if (
      !confirm(
        `Se van a MODIFICAR ${diffs.length} archivo(s) en:\n${projectPath}\n\n¿Aplicar los cambios?`,
      )
    )
      return;
    setApplying(true);
    try {
      const res = await applyDiffs(projectPath, diffs);
      if (res.failures.length > 0) {
        toast.warning(
          `Aplicados ${res.applied}/${diffs.length}. Fallaron: ${res.failures
            .map((f) => f.file)
            .join(", ")}`,
        );
      } else {
        toast.success(`${res.applied} cambio(s) aplicado(s)`);
        setApplied(true);
      }
    } catch (err) {
      toast.error((err as Error).message ?? "No se pudo aplicar");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border-silver)] bg-[var(--bg-panel)] p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--silver)]">
          <FileDiff className="h-3.5 w-3.5 text-[var(--bordo)]" />
          {diffs.length} cambio(s) propuesto(s)
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={clearDiffs}
            className="h-7 text-[10px] uppercase tracking-[0.12em] text-[var(--silver-dark)]"
          >
            Descartar
          </Button>
          <Button
            size="sm"
            onClick={onApply}
            disabled={applying || applied}
            className="h-7 gap-1.5 bg-[var(--bordo)] text-[10px] uppercase tracking-[0.12em] text-white hover:bg-[var(--bordo-mid)]"
          >
            {applying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : applied ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
            {applied ? "Aplicado" : "Aplicar todo"}
          </Button>
        </div>
      </div>

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {diffs.map((d, i) => (
          <div
            key={`${d.file}-${i}`}
            className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-2"
          >
            <div className="mb-1 truncate font-mono text-[11px] font-semibold text-[var(--fg-primary)]">
              {d.file}
            </div>
            <div className="mb-1.5 text-[10px] leading-snug text-[var(--silver-dark)]">
              {d.reason}
            </div>
            <pre className="mb-1 overflow-x-auto rounded bg-[#3a0d16]/40 px-2 py-1 font-mono text-[10px] text-[#FCA5A5]">
              <span className="select-none text-[#DC2626]">- </span>
              {d.oldString.length > 400 ? d.oldString.slice(0, 400) + "…" : d.oldString}
            </pre>
            <pre className="overflow-x-auto rounded bg-[#0d2a16]/40 px-2 py-1 font-mono text-[10px] text-[#86EFAC]">
              <span className="select-none text-[#0F9D58]">+ </span>
              {d.newString.length > 400 ? d.newString.slice(0, 400) + "…" : d.newString}
            </pre>
          </div>
        ))}
      </div>

      <p className="flex items-start gap-1 text-[9px] leading-snug text-[var(--silver-dark)]">
        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#D9A441]" />
        Aplicar escribe en los archivos reales del proyecto. Revisalos con git
        antes de commitear.
      </p>
    </div>
  );
}
