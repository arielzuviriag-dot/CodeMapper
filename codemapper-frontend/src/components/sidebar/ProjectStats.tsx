"use client";

import { Boxes, Network, Package } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";

export function ProjectStats() {
  const stats = useGraphStore((s) => s.stats);
  const packages = useGraphStore((s) => s.packages);

  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat icon={<Boxes className="h-4 w-4" />} label="Clases" value={stats.totalClasses} />
      <Stat icon={<Network className="h-4 w-4" />} label="Conexiones" value={stats.totalConnections} />
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
    <div className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-lg font-semibold leading-none">{value}</span>
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
    </div>
  );
}
