"use client";

import { useGraphStore } from "@/store/graphStore";
import type { ConnectionType } from "@/lib/types";

interface LegendItem {
  /** Connection type id used as the store key for visibility. */
  id: ConnectionType;
  label: string;
  render: () => React.ReactNode;
}

const ITEMS: LegendItem[] = [
  {
    id: "EXTENDS",
    label: "Extends",
    render: () => (
      <svg width="32" height="10">
        <line x1="0" y1="5" x2="27" y2="5" stroke="#C0C0C8" strokeWidth="1.5" />
        <polygon points="27,1 27,9 32,5" fill="none" stroke="#C0C0C8" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: "IMPLEMENTS",
    label: "Implements",
    render: () => (
      <svg width="32" height="10">
        <line
          x1="0"
          y1="5"
          x2="27"
          y2="5"
          stroke="#C0C0C8"
          strokeWidth="1.5"
          strokeDasharray="4,4"
        />
        <polygon points="27,1 27,9 32,5" fill="none" stroke="#C0C0C8" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: "COMPOSITION",
    label: "Composition",
    render: () => (
      <svg width="32" height="10">
        <line x1="0" y1="5" x2="32" y2="5" stroke="#6B6B73" strokeWidth="1.25" />
      </svg>
    ),
  },
  {
    id: "DEPENDENCY_INJECTION",
    label: "Inyección",
    render: () => (
      <svg width="32" height="10">
        <line x1="0" y1="5" x2="25" y2="5" stroke="#B91C42" strokeWidth="2" />
        <polygon points="25,0 25,10 32,5" fill="#B91C42" />
      </svg>
    ),
  },
  {
    id: "ANNOTATION_USAGE",
    label: "Anotación",
    render: () => (
      <svg width="32" height="10">
        <line
          x1="0"
          y1="5"
          x2="32"
          y2="5"
          stroke="#8B0F2A"
          strokeWidth="1.25"
          strokeDasharray="2,3"
        />
      </svg>
    ),
  },
];

export function EdgeLegend() {
  const filters = useGraphStore((s) => s.filters.connectionTypeFilters);
  const toggle = useGraphStore((s) => s.toggleConnectionTypeFilter);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] px-2.5 py-2 shadow-[var(--shadow-md)]">
      <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--silver-dark)]">
        Conexiones
      </h3>
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
    </div>
  );
}
