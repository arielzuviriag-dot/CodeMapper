"use client";

import {
  Box,
  CircleDashed,
  CircleDot,
  HelpCircle,
  Shapes,
  Square,
  X,
} from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import type { ClassKind } from "@/lib/types";

const POPOVER_ID = "class-kind-legend";

interface KindItem {
  /** ClassKind id used as the store key for visibility. */
  id: ClassKind;
  label: string;
  Icon: typeof Box;
  /** Plain-language description shown in the help popover. */
  description: string;
}

const ITEMS: KindItem[] = [
  {
    id: "CLASS",
    label: "Class",
    Icon: Box,
    description:
      "Clase normal. Tiene estado (campos), comportamiento (métodos) y se instancia con new.",
  },
  {
    id: "INTERFACE",
    label: "Interface",
    Icon: CircleDashed,
    description:
      "Contrato sin implementación (o con métodos default). No se instancia; las clases la implement.",
  },
  {
    id: "ABSTRACT_CLASS",
    label: "Abstract",
    Icon: Square,
    description:
      "Clase base que no se instancia directamente. Puede tener métodos abstractos que los hijos deben implementar.",
  },
  {
    id: "ENUM",
    label: "Enum",
    Icon: Shapes,
    description:
      "Conjunto cerrado de constantes con tipo (enum Color { RED, GREEN, BLUE }). Cada constante es una instancia única.",
  },
  {
    id: "RECORD",
    label: "Record",
    Icon: CircleDot,
    description:
      "Clase inmutable de datos (Java 14+). record Point(int x, int y) {} — genera constructor, getters, equals, hashCode y toString automáticamente. Ideal para DTOs.",
  },
];

export function ClassKindLegend() {
  const filters = useGraphStore((s) => s.filters.classTypeFilters);
  const toggle = useGraphStore((s) => s.toggleClassTypeFilter);
  const openHelpPopover = useGraphStore((s) => s.openHelpPopover);
  const setOpenHelpPopover = useGraphStore((s) => s.setOpenHelpPopover);
  const helpOpen = openHelpPopover === POPOVER_ID;

  return (
    <div className="relative flex flex-col gap-1.5 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] px-2.5 py-2 shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--silver-dark)]">
          Tipos de clase
        </h3>
        <button
          type="button"
          onClick={() => setOpenHelpPopover(helpOpen ? null : POPOVER_ID)}
          aria-label="Qué significa cada tipo"
          aria-expanded={helpOpen}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--silver-dark)] transition-colors hover:text-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {ITEMS.map((item) => {
          const checked = filters[item.id] ?? true;
          const Icon = item.Icon;
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
                className={`flex w-8 items-center justify-center transition-opacity ${
                  checked ? "" : "opacity-30"
                }`}
              >
                <Icon className="h-3.5 w-3.5 text-[var(--bordo)]" />
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
          aria-label="Glosario de tipos de clase"
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
          <ul className="flex flex-col gap-2">
            {ITEMS.map((item) => {
              const Icon = item.Icon;
              return (
                <li key={item.id} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bordo)]" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[11px] font-semibold text-[var(--fg-primary)]">
                      {item.label}
                    </span>
                    <span className="text-[10px] leading-snug text-[var(--fg-secondary)]">
                      {item.description}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
