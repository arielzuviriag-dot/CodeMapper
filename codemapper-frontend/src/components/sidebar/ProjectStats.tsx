"use client";

import { Boxes, Network, Package } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";

export function ProjectStats() {
  const stats = useGraphStore((s) => s.stats);
  const packages = useGraphStore((s) => s.packages);

  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat icon={<Boxes className="h-4 w-4" />} label="Clases" value={stats.totalClasses} />
      <Stat
        icon={<Network className="h-4 w-4" />}
        label="Conexiones"
        value={stats.totalConnections}
      />
      <Stat icon={<Package className="h-4 w-4" />} label="Paquetes" value={packages.size} />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="cm-hairline-top flex flex-col items-start gap-1 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-2.5 shadow-[var(--shadow-sm)]">
      <span className="text-[var(--silver-dark)]">{icon}</span>
      <span className="font-mono text-2xl font-semibold leading-none tabular-nums text-[var(--fg-primary)]">
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
        {label}
      </span>
    </div>
  );
}
