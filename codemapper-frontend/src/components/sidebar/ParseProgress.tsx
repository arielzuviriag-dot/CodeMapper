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

  const base =
    "flex items-center gap-2 rounded-md border bg-[var(--bg-card)] p-3 text-xs";

  if (status === "streaming") {
    return (
      <div
        className={`${base} cm-accent-bar-left border-[var(--bordo)]/40 pl-4`}
      >
        <Loader2 className="h-4 w-4 animate-spin text-[var(--bordo)]" />
        <span className="font-mono uppercase tracking-[0.14em] text-[var(--fg-primary)]">
          Analizando...
        </span>
      </div>
    );
  }

  if (status === "complete") {
    return (
      <div className={`${base} border-[var(--success)]/40`}>
        <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
        <span className="font-mono uppercase tracking-[0.14em] text-[var(--fg-primary)]">
          Listo
          {elapsedMs ? (
            <span className="ml-1 text-[var(--silver-dark)]">
              · {(elapsedMs / 1000).toFixed(1)}s
            </span>
          ) : (
            ""
          )}
        </span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={`${base} cm-accent-bar-left border-[var(--bordo)] pl-4`}>
        <AlertCircle className="h-4 w-4 text-[var(--bordo)]" />
        <span className="font-mono uppercase tracking-[0.14em] text-[var(--bordo)]">
          Error
        </span>
      </div>
    );
  }

  return (
    <div className={`${base} border-[var(--border-silver)]`}>
      <Loader2 className="h-4 w-4 animate-pulse text-[var(--fg-muted)]" />
      <span className="font-mono uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        Esperando...
      </span>
    </div>
  );
}
