"use client";

const ITEMS: { label: string; render: () => React.ReactNode }[] = [
  {
    label: "Extends",
    render: () => (
      <svg width="40" height="10">
        <line x1="0" y1="5" x2="35" y2="5" stroke="#a1a1aa" strokeWidth="2" />
        <polygon points="35,1 35,9 40,5" fill="none" stroke="#a1a1aa" strokeWidth="1.5" />
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
          stroke="#a1a1aa"
          strokeWidth="2"
          strokeDasharray="5,5"
        />
        <polygon points="35,1 35,9 40,5" fill="none" stroke="#a1a1aa" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Composition",
    render: () => (
      <svg width="40" height="10">
        <line x1="0" y1="5" x2="40" y2="5" stroke="#71717a" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Inyección",
    render: () => (
      <svg width="40" height="10">
        <line x1="0" y1="5" x2="33" y2="5" stroke="#10b981" strokeWidth="2" />
        <polygon points="33,0 33,10 40,5" fill="#10b981" />
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
          stroke="#a78bfa"
          strokeWidth="1.5"
          strokeDasharray="2,3"
        />
      </svg>
    ),
  },
];

export function EdgeLegend() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Conexiones
      </h3>
      <div className="flex flex-col gap-1.5">
        {ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <div className="flex w-10 items-center">{item.render()}</div>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
