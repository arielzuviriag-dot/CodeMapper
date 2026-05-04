"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useGraphStore } from "@/store/graphStore";
import { getClassSource } from "@/lib/api";
import { ChevronRight, FileCode, GitBranch, Hash } from "lucide-react";

/**
 * Monaco loader is preserved as-is (dynamic, ssr:false, Skeleton fallback).
 * It is a real Monaco editor — NOT replaced with <pre>.
 */
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export function ClassDetailSheet() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const sessionId = useGraphStore((s) => s.sessionId);
  const node = useGraphStore((s) =>
    selectedNodeId ? s.nodes.get(selectedNodeId) : null,
  );
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);

  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incoming = useMemo(
    () => allEdges.filter((e) => e.to === selectedNodeId),
    [allEdges, selectedNodeId],
  );
  const outgoing = useMemo(
    () => allEdges.filter((e) => e.from === selectedNodeId),
    [allEdges, selectedNodeId],
  );

  useEffect(() => {
    if (!selectedNodeId || !sessionId) {
      setSource(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSource(null);
    setError(null);
    getClassSource(sessionId, selectedNodeId)
      .then((res) => {
        if (cancelled) return;
        console.log("[CodeMapper] source response:", res);
        const code = res?.sourceCode ?? "";
        if (!code) {
          setError("La respuesta del backend no incluye sourceCode.");
          setSource("");
        } else {
          setSource(code);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[CodeMapper] source fetch failed", err);
        setError(err?.message ?? "No se pudo cargar el código fuente.");
        setSource("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedNodeId, sessionId]);

  return (
    <Sheet
      open={!!selectedNodeId}
      onOpenChange={(open) => {
        if (!open) clearSelection();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col border-l border-[var(--border-silver)] bg-[var(--bg-card)] p-0 sm:max-w-2xl"
      >
        {node ? (
          <>
            <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] px-6 py-4">
              <SheetTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
                <FileCode className="h-5 w-5 text-[var(--bordo)]" />
                <span className="font-semibold">{node.name}</span>
              </SheetTitle>
              <SheetDescription className="truncate font-mono text-xs text-[var(--silver-dark)]">
                {node.fullyQualifiedName}
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="source" className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-6 mt-4 grid grid-cols-4 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-1">
                {[
                  { v: "source", label: "Código" },
                  { v: "incoming", label: `Entrantes (${incoming.length})` },
                  { v: "outgoing", label: `Salientes (${outgoing.length})` },
                  { v: "metrics", label: "Métricas" },
                ].map((t) => (
                  <TabsTrigger
                    key={t.v}
                    value={t.v}
                    className="rounded-[6px] text-[10px] uppercase tracking-[0.14em] data-[state=active]:bg-[var(--bordo)] data-[state=active]:text-white data-[state=active]:shadow-[0_0_14px_rgba(185,28,66,0.35)]"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="source" className="flex-1 px-6 pb-6 pt-4">
                <div className="flex h-full flex-col overflow-hidden rounded-md border border-[var(--border-silver)] shadow-[var(--shadow-md)]">
                  {error && (
                    <div className="cm-accent-bar-left border-b border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-3 py-2 pl-4 text-xs text-[var(--bordo)]">
                      {error}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden bg-[#0A0A0A]">
                    {loading || source === null ? (
                      <Skeleton className="h-full w-full" />
                    ) : (
                      <MonacoEditor
                        height="100%"
                        defaultLanguage="java"
                        value={source}
                        theme="vs-dark"
                        options={{
                          readOnly: true,
                          minimap: { enabled: true },
                          fontSize: 13,
                          fontFamily:
                            "'JetBrains Mono', var(--font-geist-mono), monospace",
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          renderLineHighlight: "gutter",
                          smoothScrolling: true,
                        }}
                      />
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="incoming" className="flex-1 px-6 pb-6 pt-4">
                <ConnectionList
                  items={incoming.map((e) => ({
                    id: e.from,
                    type: e.type,
                    label: e.label,
                  }))}
                  resolveName={(id) =>
                    allNodes.get(id)?.name ?? id.split(".").pop() ?? id
                  }
                  onJump={(id) => {
                    selectNode(id);
                  }}
                />
              </TabsContent>

              <TabsContent value="outgoing" className="flex-1 px-6 pb-6 pt-4">
                <ConnectionList
                  items={outgoing.map((e) => ({
                    id: e.to,
                    type: e.type,
                    label: e.label,
                  }))}
                  resolveName={(id) =>
                    allNodes.get(id)?.name ?? id.split(".").pop() ?? id
                  }
                  onJump={(id) => {
                    selectNode(id);
                  }}
                />
              </TabsContent>

              <TabsContent value="metrics" className="flex-1 px-6 pb-6 pt-4">
                <div className="flex flex-col gap-3 text-sm">
                  <Metric label="Campos" value={node.fields.length} />
                  <Metric label="Métodos" value={node.methods.length} />
                  <Metric label="Líneas" value={node.lineCount} />
                  <Metric
                    label="Conexiones"
                    value={incoming.length + outgoing.length}
                  />
                  <Metric
                    label="Complejidad estimada"
                    value={
                      node.fields.length +
                      node.methods.length +
                      incoming.length +
                      outgoing.length
                    }
                  />
                  <Separator className="my-2 bg-[var(--border-silver)]" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
                      Path
                    </span>
                    <code className="break-all rounded-sm border border-[var(--border-silver)] bg-[var(--bg-input)] px-2 py-1.5 font-mono text-xs text-[var(--silver)]">
                      {node.filePath}
                    </code>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
                      Tipo
                    </span>
                    <Badge
                      variant="outline"
                      className="w-fit border-[var(--bordo)]/40 bg-[var(--bordo)]/10 text-[var(--bordo)]"
                    >
                      {node.type}
                    </Badge>
                  </div>
                  {node.modifiers.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
                        Modificadores
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {node.modifiers.map((m) => (
                          <Badge
                            key={m}
                            variant="secondary"
                            className="border border-[var(--border-silver)] bg-[var(--bg-panel)] font-mono text-[10px] tracking-tight text-[var(--silver)]"
                          >
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[var(--silver-dark)]">
        <Hash className="h-3.5 w-3.5" />
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <span className="font-mono text-base font-semibold tabular-nums text-[var(--fg-primary)]">
        {value}
      </span>
    </div>
  );
}

interface ConnectionItem {
  id: string;
  type: string;
  label: string;
}

function ConnectionList({
  items,
  resolveName,
  onJump,
}: {
  items: ConnectionItem[];
  resolveName: (id: string) => string;
  onJump: (id: string) => void;
}) {
  const rf = useReactFlow();
  const center = (id: string) => {
    const node = rf.getNode(id);
    if (node) {
      rf.setCenter(node.position.x + 140, node.position.y + 110, {
        zoom: 1.2,
        duration: 400,
      });
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--fg-muted)]">
        Sin conexiones
      </div>
    );
  }
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 pr-3">
        {items.map((it, idx) => (
          <button
            key={`${it.id}-${idx}`}
            onClick={() => {
              onJump(it.id);
              center(it.id);
            }}
            className="group flex items-center justify-between gap-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-3 text-left transition-all hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/5 hover:shadow-[0_0_14px_rgba(185,28,66,0.18)]"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-[var(--fg-primary)]">
                {resolveName(it.id)}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
                <GitBranch className="mr-1 inline h-3 w-3" />
                {it.type}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--silver-dark)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--bordo)]" />
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
