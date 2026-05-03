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
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-2xl">
        {node ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-primary" />
                {node.name}
              </SheetTitle>
              <SheetDescription className="truncate">
                {node.fullyQualifiedName}
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="source" className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-6 grid grid-cols-4">
                <TabsTrigger value="source">Código</TabsTrigger>
                <TabsTrigger value="incoming">
                  Entrantes ({incoming.length})
                </TabsTrigger>
                <TabsTrigger value="outgoing">
                  Salientes ({outgoing.length})
                </TabsTrigger>
                <TabsTrigger value="metrics">Métricas</TabsTrigger>
              </TabsList>

              <TabsContent value="source" className="flex-1 px-6 pb-6">
                <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border">
                  {error && (
                    <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {error}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
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
                          fontFamily: "var(--font-geist-mono)",
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                        }}
                      />
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="incoming" className="flex-1 px-6 pb-6">
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

              <TabsContent value="outgoing" className="flex-1 px-6 pb-6">
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

              <TabsContent value="metrics" className="flex-1 px-6 pb-6">
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
                  <Separator className="my-2" />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Path</span>
                    <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                      {node.filePath}
                    </code>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Tipo</span>
                    <Badge variant="outline" className="w-fit">
                      {node.type}
                    </Badge>
                  </div>
                  {node.modifiers.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Modificadores</span>
                      <div className="flex flex-wrap gap-1">
                        {node.modifiers.map((m) => (
                          <Badge key={m} variant="secondary">
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
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Hash className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
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
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
            className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{resolveName(it.id)}</span>
              <span className="text-xs text-muted-foreground">
                <GitBranch className="mr-1 inline h-3 w-3" />
                {it.type}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
