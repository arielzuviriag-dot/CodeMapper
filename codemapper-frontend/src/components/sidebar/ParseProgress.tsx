"use client";

import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";

export function ParseProgress() {
  const status = useGraphStore((s) => s.sessionStatus);
  const stats = useGraphStore((s) => s.stats);

  const elapsedMs =
    status === "complete" && stats.parseEndTime > 0
      ? stats.parseEndTime - stats.parseStartTime
      : null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-xs">
      {status === "streaming" && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Analizando proyecto...</span>
        </>
      )}
      {status === "complete" && (
        <>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>
            Análisis listo
            {elapsedMs ? ` · ${(elapsedMs / 1000).toFixed(1)}s` : ""}
          </span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span>Error en el análisis</span>
        </>
      )}
      {status === "idle" && (
        <>
          <Loader2 className="h-4 w-4 animate-pulse text-muted-foreground" />
          <span>Esperando...</span>
        </>
      )}
    </div>
  );
}
