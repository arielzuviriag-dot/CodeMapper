"use client";

import { HelpCircle, X } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import type { FocusConnectionType } from "@/lib/types";

const POPOVER_ID = "focus-connection-legend";

interface LegendItem {
  /** FocusConnectionType id used as the store key for visibility. */
  id: FocusConnectionType;
  label: string;
  render: () => React.ReactNode;
  /** Plain-language description shown in the help popover. */
  description: string;
}

/** Mirror of the arrow styles drawn by FocusEdge so the legend reads as a
 *  one-to-one key for the lines visible on the radial graph. Colours and
 *  dash patterns are kept in sync with FocusEdge's TYPE_STYLE table. */
const ITEMS: LegendItem[] = [
  {
    id: "CALLS",
    label: "Llama a",
    description:
      "La clase foco contiene código que invoca métodos de la clase peripheral.",
    render: () => (
      <svg width="32" height="10">
        <line x1="0" y1="5" x2="25" y2="5" stroke="#B91C42" strokeWidth="2" />
        <polygon points="25,0 25,10 32,5" fill="#B91C42" />
      </svg>
    ),
  },
  {
    id: "CALLED_BY",
    label: "Llamado por",
    description:
      "La clase peripheral contiene código que invoca métodos de la clase foco. La flecha apunta hacia la clase foco.",
    render: () => (
      <svg width="32" height="10">
        <polygon points="0,5 7,1 7,9" fill="#B91C42" />
        <line x1="7" y1="5" x2="32" y2="5" stroke="#B91C42" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: "EXTENDS",
    label: "Extiende",
    description:
      "Herencia: la clase foco hereda de la clase peripheral con extends. Java solo permite una clase padre.",
    render: () => (
      <svg width="32" height="10">
        <line x1="0" y1="5" x2="27" y2="5" stroke="#C0C0C8" strokeWidth="2" />
        <polygon points="27,1 27,9 32,5" fill="none" stroke="#C0C0C8" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: "IMPLEMENTS",
    label: "Implementa",
    description:
      "La clase foco implementa la interface peripheral (implements). Una clase puede implementar múltiples interfaces.",
    render: () => (
      <svg width="32" height="10">
        <line
          x1="0"
          y1="5"
          x2="27"
          y2="5"
          stroke="#C0C0C8"
          strokeWidth="1.5"
          strokeDasharray="6,5"
        />
        <polygon points="27,1 27,9 32,5" fill="none" stroke="#C0C0C8" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: "USES_PROPERTIES",
    label: "Usa props",
    description:
      "La clase foco accede a campos (atributos públicos) de la clase peripheral, sin invocar sus métodos.",
    render: () => (
      <svg width="32" height="10">
        <line
          x1="0"
          y1="5"
          x2="25"
          y2="5"
          stroke="#8B0F2A"
          strokeWidth="1.75"
          strokeDasharray="3,4"
        />
        <polygon points="25,0 25,10 32,5" fill="#8B0F2A" />
      </svg>
    ),
  },
];

export function FocusConnectionLegend() {
  const filters = useGraphStore((s) => s.filters.focusConnectionTypeFilters);
  const toggle = useGraphStore((s) => s.toggleFocusConnectionTypeFilter);
  const openHelpPopover = useGraphStore((s) => s.openHelpPopover);
  const setOpenHelpPopover = useGraphStore((s) => s.setOpenHelpPopover);
  const helpOpen = openHelpPopover === POPOVER_ID;

  return (
    <div className="relative flex flex-col gap-1.5 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] px-2.5 py-2 shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--silver-dark)]">
          Conexiones
        </h3>
        <button
          type="button"
          onClick={() => setOpenHelpPopover(helpOpen ? null : POPOVER_ID)}
          aria-label="Qué significa cada conexión"
          aria-expanded={helpOpen}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--silver-dark)] transition-colors hover:text-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {ITEMS.map((item) => {
          const checked = filters[item.id] ?? true;
          return (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 font-mono text-[11px] text-[var(--fg-secondary)] transition-colors hover:text-[var(--fg-primary)]"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(item.id)}
                className="h-3.5 w-3.5 shrink-0 accent-[var(--bordo)]"
              />
              <div
                className={`flex w-8 items-center transition-opacity ${
                  checked ? "" : "opacity-30"
                }`}
              >
                {item.render()}
              </div>
              <span className={checked ? "" : "opacity-50 line-through"}>
                {item.label}
              </span>
            </label>
          );
        })}
      </div>

      {helpOpen && (
        <div
          role="dialog"
          aria-label="Glosario de conexiones"
          className="fixed right-[194px] top-[80px] z-30 flex w-[300px] flex-col gap-2.5 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
              Glosario
            </span>
            <button
              type="button"
              onClick={() => setOpenHelpPopover(null)}
              aria-label="Cerrar"
              className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--silver-dark)] transition-colors hover:text-[var(--bordo)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="flex flex-col gap-2.5">
            {ITEMS.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <div className="mt-0.5 flex w-8 shrink-0 items-center">
                  {item.render()}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[11px] font-semibold text-[var(--fg-primary)]">
                    {item.label}
                  </span>
                  <span className="text-[10px] leading-snug text-[var(--fg-secondary)]">
                    {item.description}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
