"use client";

const ITEMS: { label: string; render: () => React.ReactNode }[] = [
  {
    label: "Extends",
    render: () => (
      <svg width="40" height="10">
        <line x1="0" y1="5" x2="35" y2="5" stroke="#C0C0C8" strokeWidth="1.5" />
        <polygon points="35,1 35,9 40,5" fill="none" stroke="#C0C0C8" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Implements",
    render: () => (
      <svg width="40" height="10">
        <line
          x1="0"
          y1="5"
          x2="35"
          y2="5"
          stroke="#C0C0C8"
          strokeWidth="1.5"
          strokeDasharray="5,5"
        />
        <polygon points="35,1 35,9 40,5" fill="none" stroke="#C0C0C8" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Composition",
    render: () => (
      <svg width="40" height="10">
        <line x1="0" y1="5" x2="40" y2="5" stroke="#6B6B73" strokeWidth="1.25" />
      </svg>
    ),
  },
  {
    label: "Inyección",
    render: () => (
      <svg width="40" height="10">
        <line x1="0" y1="5" x2="33" y2="5" stroke="#B91C42" strokeWidth="2" />
        <polygon points="33,0 33,10 40,5" fill="#B91C42" />
      </svg>
    ),
  },
  {
    label: "Anotación",
    render: () => (
      <svg width="40" height="10">
        <line
          x1="0"
          y1="5"
          x2="40"
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
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-md)]">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
        Conexiones
      </h3>
      <div className="flex flex-col gap-1.5">
        {ITEMS.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 font-mono text-xs text-[var(--fg-secondary)]"
          >
            <div className="flex w-10 items-center">{item.render()}</div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
