"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useReactFlow } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Crosshair,
  FileCode,
  GitBranch,
  Hash,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useGraphStore } from "@/store/graphStore";
import { analyzeFocus, getClassSource, resolveDemoMode } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/** Strips a project root from an absolute file path and returns the
 *  forward-slash relative path, or null if the file is outside the root. */
function computeRelativeFocusFile(
  projectPath: string,
  filePath: string,
): string | null {
  const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");
  const np = norm(projectPath);
  const nf = norm(filePath);
  if (!nf.startsWith(np)) return null;
  let rel = nf.slice(np.length);
  if (rel.startsWith("/")) rel = rel.slice(1);
  return rel;
}

export function ClassDetailSheet() {
  const router = useRouter();
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const sessionId = useGraphStore((s) => s.sessionId);
  const node = useGraphStore((s) =>
    selectedNodeId ? s.nodes.get(selectedNodeId) : null,
  );
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);
  const focusMode = useGraphStore((s) => s.focusMode);
  const focusClass = useGraphStore((s) => s.focusClass);
  const projectPath = useGraphStore((s) => s.projectPath);

  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocusing, setIsFocusing] = useState(false);

  const isCurrentFocus =
    focusMode && focusClass !== null && focusClass.id === selectedNodeId;
  /** True when the selected node is a level-1 peripheral whose source the
   *  backend doesn't expose yet (only the focus class itself is stored in
   *  session.parsedClasses). We swap the error for a friendly CTA. */
  const isFocusPeripheral =
    focusMode && focusClass !== null && focusClass.id !== selectedNodeId;

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
    if (isFocusPeripheral) {
      // Skip the source request — the friendly placeholder is shown instead.
      setSource(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSource(null);
    setError(null);
    getClassSource(sessionId, selectedNodeId)
      .then((res) => {
        if (cancelled) return;
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
  }, [selectedNodeId, sessionId, isFocusPeripheral]);

  const canFocusScan =
    !!node &&
    !isCurrentFocus &&
    !!projectPath &&
    !!node.filePath &&
    computeRelativeFocusFile(projectPath, node.filePath) !== null;

  const onFocusScan = async () => {
    if (!node || !projectPath || isFocusing) return;
    const rel = computeRelativeFocusFile(projectPath, node.filePath);
    if (!rel) {
      toast.error("No se puede deducir el path relativo del archivo");
      return;
    }
    setIsFocusing(true);
    const demoMode = resolveDemoMode();
    let newSessionId: string;
    try {
      const res = await analyzeFocus({
        projectPath,
        focusFile: rel,
        demoMode,
      });
      newSessionId = res.sessionId;
    } catch {
      // toast already surfaced by axios interceptor
      setIsFocusing(false);
      return;
    }
    clearSelection();
    const params = new URLSearchParams({ mode: "focus" });
    if (demoMode === "pro") params.set("demo", "pro");
    // replace (not push): refocusing in-place shouldn't grow history.
    router.replace(`/map/${newSessionId}?${params.toString()}`);
    // The map page's effect will reset state on sessionId change; no need to
    // unset isFocusing here because the sheet will be unmounted by clearSelection.
  };

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
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <SheetTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
                    {isCurrentFocus ? (
                      <Crosshair
                        className="h-5 w-5 text-[var(--bordo)]"
                        strokeWidth={2.2}
                        style={{ filter: "drop-shadow(0 0 6px rgba(185,28,66,0.55))" }}
                      />
                    ) : (
                      <FileCode className="h-5 w-5 text-[var(--bordo)]" />
                    )}
                    <span className="truncate font-semibold">{node.name}</span>
                  </SheetTitle>
                  <SheetDescription className="truncate font-mono text-xs text-[var(--silver-dark)]">
                    {node.fullyQualifiedName}
                  </SheetDescription>
                </div>

                {isCurrentFocus ? (
                  <span className="shrink-0 self-start rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
                    Clase enfocada
                  </span>
                ) : canFocusScan ? (
                  <motion.div
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25 }}
                    className="shrink-0"
                  >
                    <Button
                      size="sm"
                      onClick={onFocusScan}
                      disabled={isFocusing}
                      className="bg-[var(--bordo)] font-mono text-[11px] uppercase tracking-[0.16em] text-white shadow-[0_0_18px_rgba(185,28,66,0.4)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_24px_rgba(185,28,66,0.6)] disabled:bg-[var(--bordo)] disabled:opacity-70"
                    >
                      {isFocusing ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Enfocando...
                        </>
                      ) : (
                        <>
                          <Crosshair className="mr-1.5 h-3.5 w-3.5" />
                          Foco Scaner
                        </>
                      )}
                    </Button>
                  </motion.div>
                ) : null}
              </div>
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
                {isFocusPeripheral ? (
                  <PeripheralSourcePlaceholder
                    canFocusScan={canFocusScan}
                    isFocusing={isFocusing}
                    onFocusScan={onFocusScan}
                  />
                ) : (
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
                )}
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

function PeripheralSourcePlaceholder({
  canFocusScan,
  isFocusing,
  onFocusScan,
}: {
  canFocusScan: boolean;
  isFocusing: boolean;
  onFocusScan: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-md border border-dashed border-[var(--border-silver)] bg-[var(--bg-input)]/40 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--bordo)]/40 bg-[var(--bordo)]/10">
        <Crosshair className="h-6 w-6 text-[var(--bordo)]" strokeWidth={1.6} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--bordo)]">
          Nivel 1 — código no cargado
        </span>
        <p className="max-w-xs text-sm text-[var(--fg-secondary)]">
          El código fuente de los nodos del nivel 1 se carga al re-enfocar el
          análisis sobre esa clase.
        </p>
      </div>
      {canFocusScan && (
        <Button
          size="sm"
          onClick={onFocusScan}
          disabled={isFocusing}
          className="bg-[var(--bordo)] font-mono text-[11px] uppercase tracking-[0.16em] text-white shadow-[0_0_18px_rgba(185,28,66,0.4)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_24px_rgba(185,28,66,0.6)] disabled:opacity-70"
        >
          {isFocusing ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Enfocando...
            </>
          ) : (
            <>
              <Crosshair className="mr-1.5 h-3.5 w-3.5" />
              Foco Scaner sobre esta clase
            </>
          )}
        </Button>
      )}
    </div>
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
