"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useGraphStore } from "@/store/graphStore";
import type { ClassNodeData } from "@/lib/types";

const AUTOCOMPLETE_MIN_CHARS = 3;
const AUTOCOMPLETE_MAX_RESULTS = 50;

/** "Camera finder" search bar. Reads from the regular `nodes` Map (focus
 *  payloads are mirrored there too) and fits the camera onto the picked
 *  class without filtering anything out of the graph. Reused by CodeGraph,
 *  FocusGraph and FocusMethodGraph so the muscle memory carries across
 *  modes. */
export function GraphSearchInput() {
  const [value, setValue] = useState("");
  const version = useGraphStore((s) => s.version);
  const { fitView } = useReactFlow();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < AUTOCOMPLETE_MIN_CHARS) return [];
    const list: ClassNodeData[] = [];
    useGraphStore.getState().nodes.forEach((n) => {
      if (
        n.name.toLowerCase().includes(q) ||
        n.fullyQualifiedName.toLowerCase().includes(q)
      ) {
        list.push(n);
      }
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list.slice(0, AUTOCOMPLETE_MAX_RESULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, version]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as globalThis.Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const showDropdown = open && value.trim().length >= AUTOCOMPLETE_MIN_CHARS;

  const onPick = (match: ClassNodeData) => {
    setValue(match.name);
    fitView({ nodes: [{ id: match.id }], duration: 600, maxZoom: 1.4, padding: 0.5 });
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="pointer-events-auto relative w-[240px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[var(--silver-dark)]" />
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar clase..."
        className="h-8 border-[var(--border-silver)] bg-[var(--bg-card)]/95 pl-8 pr-2 font-mono text-xs shadow-[var(--shadow-md)] backdrop-blur"
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-[280px] overflow-y-auto rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)]/95 shadow-[var(--shadow-md)] backdrop-blur">
          {matches.length === 0 ? (
            <div className="px-2.5 py-2 font-mono text-[11px] text-[var(--fg-muted)]">
              Sin coincidencias
            </div>
          ) : (
            matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onPick(m)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-[var(--border-silver)]/40 px-2.5 py-1.5 text-left transition-colors last:border-b-0 hover:bg-[var(--bordo)]/10"
              >
                <span className="font-mono text-xs text-[var(--fg-primary)]">
                  {m.name}
                </span>
                <span className="w-full truncate font-mono text-[10px] text-[var(--fg-muted)]">
                  {m.fullyQualifiedName}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
