"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export function FilterPanel() {
  const filters = useGraphStore((s) => s.filters);
  const updateFilter = useGraphStore((s) => s.updateFilter);
  const toggleAnnotation = useGraphStore((s) => s.toggleAnnotationFilter);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-md)]">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
        Anotaciones
      </span>

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

      <div className="flex flex-col gap-2">
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
    </div>
  );
}
