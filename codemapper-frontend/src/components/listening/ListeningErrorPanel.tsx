"use client";

import { AlertTriangle, X } from "lucide-react";
import { useListeningStore } from "@/store/listeningStore";

/**
 * "Escuchando" mode — side panel showing the exception that broke the
 * execution: type, message and full stacktrace. Opens when the user clicks an
 * errored (red) node. The stacktrace is rendered as plain text (React escapes
 * it) — never as HTML.
 */
export function ListeningErrorPanel() {
  // Select STABLE references only — never build a fresh object inside the
  // selector (that makes zustand's getSnapshot return a new value every render
  // → "Maximum update depth exceeded"). The className is a primitive and the
  // node is the same object reference until the graph rebuilds.
  const className = useListeningStore((s) => s.selectedErrorClass);
  const node = useListeningStore((s) =>
    s.selectedErrorClass
      ? s.nodes.find((n) => n.className === s.selectedErrorClass) ?? null
      : null,
  );
  const close = useListeningStore((s) => s.selectError);

  if (!className || !node) return null;
  const error = node.error;

  return (
    <aside className="absolute right-0 top-[56px] z-40 flex h-[calc(100%-56px)] w-[420px] max-w-[90vw] flex-col border-l border-[#DC2626]/40 bg-[var(--bg-card)] shadow-[var(--shadow-xl)]">
      <header
        className="flex items-center gap-2 px-4 py-3 text-white"
        style={{ background: "#DC2626" }}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span className="truncate text-sm font-semibold">{className}</span>
        <button
          type="button"
          onClick={() => close(null)}
          aria-label="Cerrar"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-sm transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--silver-dark)]">
          Tipo
        </div>
        <div className="mb-4 break-all font-mono text-sm text-[#FCA5A5]">
          {error?.type ?? "(desconocido)"}
        </div>

        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--silver-dark)]">
          Mensaje
        </div>
        <div className="mb-4 break-words font-mono text-xs text-[var(--fg-primary)]">
          {error?.message ?? "(sin mensaje)"}
        </div>

        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--silver-dark)]">
          Stacktrace
        </div>
        {error?.stacktrace ? (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-3 font-mono text-[11px] leading-relaxed text-[var(--silver)]">
            {error.stacktrace}
          </pre>
        ) : (
          <div className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-3 font-mono text-[11px] text-[var(--silver-dark)]">
            El span no incluyó stacktrace. Activá la instrumentación de
            excepciones del agente para verlo.
          </div>
        )}
      </div>
    </aside>
  );
}
