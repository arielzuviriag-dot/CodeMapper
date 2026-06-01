"use client";

import { useState } from "react";
import { ChevronDown, Layers3, X } from "lucide-react";
import { LENS_META, type LensId, type LensResult } from "./lenses";

interface Props {
  active: LensId;
  onChange: (l: LensId) => void;
  result: LensResult | null;
}

/**
 * Panel de "Lentes" del grafo — arriba a la IZQUIERDA del canvas para no
 * solaparse con el zoom/leyendas (derecha), el buscador (arriba-centro) ni el
 * minimapa (abajo-derecha). Colapsable: cerrado ocupa un chip; abierto lista
 * las lentes y, si hay una activa, su leyenda + resumen.
 */
export function LensPanel({ active, onChange, result }: Props) {
  const [open, setOpen] = useState(false);
  const activeMeta = LENS_META.find((m) => m.id === active);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] shadow-[var(--shadow-md)] transition-colors ${
          active !== "none"
            ? "border-[var(--bordo)] bg-[var(--bordo)]/15 text-[var(--bordo)]"
            : "border-[var(--border-silver)] bg-[var(--bg-card)] text-[var(--silver)] hover:text-[var(--bordo)]"
        }`}
        title="Lentes del grafo"
      >
        <Layers3 className="h-4 w-4" />
        {active !== "none" ? activeMeta?.label : "Lentes"}
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-10 flex max-h-[80%] w-[230px] flex-col overflow-hidden rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between border-b border-[var(--border-silver)] px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--silver)]">
          <Layers3 className="h-3.5 w-3.5 text-[var(--bordo)]" /> Lentes
        </span>
        <button type="button" onClick={() => setOpen(false)} title="Cerrar" className="text-[var(--silver-dark)] hover:text-[var(--bordo)]">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto p-2">
        {LENS_META.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(active === m.id ? "none" : m.id)}
            title={m.desc}
            className={`flex flex-col items-start rounded-sm px-2 py-1.5 text-left transition-colors ${
              active === m.id
                ? "bg-[var(--bordo)] text-white"
                : "text-[var(--silver)] hover:bg-[var(--bordo)]/12 hover:text-[var(--bordo)]"
            }`}
          >
            <span className="font-mono text-[11px] font-semibold">{m.label}</span>
            <span className={`text-[10px] leading-tight ${active === m.id ? "text-white/80" : "text-[var(--silver-dark)]"}`}>
              {m.desc}
            </span>
          </button>
        ))}
      </div>

      {active !== "none" && result && (
        <div className="border-t border-[var(--border-silver)] bg-[var(--bg-panel)] p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--silver-dark)]">
              {result.summary}
            </span>
            <button
              type="button"
              onClick={() => onChange("none")}
              title="Quitar lente"
              className="text-[var(--silver-dark)] hover:text-[var(--bordo)]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {result.legend.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5 text-[10px] text-[var(--silver)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
