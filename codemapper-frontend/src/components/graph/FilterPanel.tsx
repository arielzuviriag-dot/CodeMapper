"use client";

import { Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useGraphStore } from "@/store/graphStore";

const ANNOTATIONS = [
  "RestController",
  "Controller",
  "Service",
  "Repository",
  "Component",
  "Entity",
  "Configuration",
];

const CLASS_TYPES = [
  { id: "CLASS", label: "Class" },
  { id: "INTERFACE", label: "Interface" },
  { id: "ENUM", label: "Enum" },
  { id: "RECORD", label: "Record" },
  { id: "ABSTRACT_CLASS", label: "Abstract" },
];

interface Props {
  onResetLayout: () => void;
}

export function FilterPanel({ onResetLayout }: Props) {
  const filters = useGraphStore((s) => s.filters);
  const updateFilter = useGraphStore((s) => s.updateFilter);
  const toggleAnnotation = useGraphStore((s) => s.toggleAnnotationFilter);
  const toggleType = useGraphStore((s) => s.toggleClassTypeFilter);
  const reset = useGraphStore((s) => s.resetFilters);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filtros
        </h3>
        <Button size="sm" variant="ghost" onClick={reset} className="h-7 px-2 text-xs">
          <RotateCcw className="mr-1 h-3 w-3" /> Reset
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.searchQuery}
          onChange={(e) => updateFilter("searchQuery", e.target.value)}
          placeholder="Buscar clase..."
          className="h-8 pl-7 text-xs"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="hide-getset" className="text-xs">
          Ocultar getters/setters
        </Label>
        <Switch
          id="hide-getset"
          checked={filters.hideGettersSetters}
          onCheckedChange={(v) => updateFilter("hideGettersSetters", v)}
        />
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          Anotaciones
        </span>
        {ANNOTATIONS.map((ann) => (
          <label
            key={ann}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <input
              type="checkbox"
              checked={filters.annotationFilters[ann] ?? true}
              onChange={() => toggleAnnotation(ann)}
              className="h-3.5 w-3.5 accent-primary"
            />
            @{ann}
          </label>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          Tipo de clase
        </span>
        {CLASS_TYPES.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <input
              type="checkbox"
              checked={filters.classTypeFilters[t.id] ?? true}
              onChange={() => toggleType(t.id)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {t.label}
          </label>
        ))}
      </div>

      <Separator />

      <Button size="sm" variant="outline" onClick={onResetLayout}>
        <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset layout
      </Button>
    </div>
  );
}
