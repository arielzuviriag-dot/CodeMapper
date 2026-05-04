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

/** Color dot per annotation, matched to ClassNode header palette. */
const ANNOTATION_DOT: Record<string, string> = {
  RestController: "#B91C42",
  Controller:     "#B91C42",
  Service:        "#C0C0C8",
  Repository:     "#5C0A1A",
  Component:      "#4A5568",
  Entity:         "#8B0F2A",
  Configuration:  "#A8A8B0",
};

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
    <div className="flex flex-col gap-4 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
          Filtros
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={reset}
          className="h-7 px-2 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)] hover:text-[var(--bordo)]"
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Reset
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--silver-dark)]" />
        <Input
          value={filters.searchQuery}
          onChange={(e) => updateFilter("searchQuery", e.target.value)}
          placeholder="Buscar clase..."
          className="h-8 border-[var(--border-silver)] bg-[var(--bg-input)] pl-7 font-mono text-xs"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label
          htmlFor="hide-getset"
          className="text-xs text-[var(--fg-secondary)]"
        >
          Ocultar getters/setters
        </Label>
        <Switch
          id="hide-getset"
          checked={filters.hideGettersSetters}
          onCheckedChange={(v) => updateFilter("hideGettersSetters", v)}
        />
      </div>

      <Separator className="bg-[var(--border-silver)]" />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
          Anotaciones
        </span>
        {ANNOTATIONS.map((ann) => (
          <label
            key={ann}
            className="group flex cursor-pointer items-center gap-2 font-mono text-xs text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          >
            <input
              type="checkbox"
              checked={filters.annotationFilters[ann] ?? true}
              onChange={() => toggleAnnotation(ann)}
              className="h-3.5 w-3.5 accent-[var(--bordo)]"
            />
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: ANNOTATION_DOT[ann] ?? "#3A3A3A" }}
            />
            @{ann}
          </label>
        ))}
      </div>

      <Separator className="bg-[var(--border-silver)]" />

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
          Tipo de clase
        </span>
        {CLASS_TYPES.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-center gap-2 font-mono text-xs text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          >
            <input
              type="checkbox"
              checked={filters.classTypeFilters[t.id] ?? true}
              onChange={() => toggleType(t.id)}
              className="h-3.5 w-3.5 accent-[var(--bordo)]"
            />
            {t.label}
          </label>
        ))}
      </div>

      <Separator className="bg-[var(--border-silver)]" />

      <Button
        size="sm"
        variant="outline"
        onClick={onResetLayout}
        className="border-[var(--border-silver)] bg-transparent text-xs uppercase tracking-[0.14em] hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
      >
        <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset layout
      </Button>
    </div>
  );
}
