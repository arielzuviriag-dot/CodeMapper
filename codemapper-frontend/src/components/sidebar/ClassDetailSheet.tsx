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
import {
  analyzeFocus,
  analyzeFocusMethod,
  getClassSource,
  resolveDemoMode,
} from "@/lib/api";
import type {
  ClassNodeData,
  Connection,
  ParsedField,
  ParsedMethod,
} from "@/lib/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const MONACO_OPTIONS = {
  readOnly: true,
  minimap: { enabled: true },
  fontSize: 13,
  fontFamily: "'JetBrains Mono', var(--font-geist-mono), monospace",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  renderLineHighlight: "gutter",
  smoothScrolling: true,
} as const;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

interface VariableUsage {
  /** 1-based line number where the variable appears. */
  line: number;
  /** Snippet starting line (1-based). */
  contextStartLine: number;
  snippet: string;
}

function findVariableUsages(source: string, varName: string): VariableUsage[] {
  if (!source || !varName) return [];
  const lines = source.split("\n");
  const re = new RegExp(`\\b${escapeRegex(varName)}\\b`);
  const matches: VariableUsage[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    const from = Math.max(0, i - 2);
    const to = Math.min(lines.length - 1, i + 2);
    matches.push({
      line: i + 1,
      contextStartLine: from + 1,
      snippet: lines.slice(from, to + 1).join("\n"),
    });
  }
  return matches;
}

function sliceMethodSource(
  source: string,
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  if (!source) return "";
  if (!startLine || !endLine || endLine < startLine) return "";
  const lines = source.split("\n");
  const from = Math.max(0, startLine - 1);
  const to = Math.min(lines.length, endLine);
  return lines.slice(from, to).join("\n");
}

export function ClassDetailSheet() {
  const router = useRouter();
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const sheetMode = useGraphStore((s) => s.sheetMode);
  const selectedVariable = useGraphStore((s) => s.selectedVariable);
  const selectedMethod = useGraphStore((s) => s.selectedMethod);
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
  const focusMethod = useGraphStore((s) => s.focusMethod);
  const focusMethodMode = useGraphStore((s) => s.focusMethodMode);
  const focusConnections = useGraphStore((s) => s.focusConnections);
  const projectPath = useGraphStore((s) => s.projectPath);

  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocusing, setIsFocusing] = useState(false);

  const isCurrentFocusClass =
    focusMode && focusClass !== null && focusClass.id === selectedNodeId;
  const isCurrentFocusMethod =
    focusMethodMode && focusMethod !== null && focusMethod.id === selectedNodeId;
  /** Peripheral of focus-class mode whose source the backend doesn't expose. */
  const isFocusPeripheral =
    focusMode &&
    focusClass !== null &&
    focusClass.id !== selectedNodeId &&
    sheetMode === "class" &&
    !focusMethodMode;

  const incoming = useMemo(
    () => allEdges.filter((e) => e.to === selectedNodeId),
    [allEdges, selectedNodeId],
  );
  const outgoing = useMemo(
    () => allEdges.filter((e) => e.from === selectedNodeId),
    [allEdges, selectedNodeId],
  );

  // Fetch class source — only for class-mode views, OR when we need to slice
  // a method body from the class file (variable/method modes on a regular class).
  useEffect(() => {
    if (!selectedNodeId || !sessionId) {
      setSource(null);
      setError(null);
      return;
    }
    if (isFocusPeripheral) {
      setSource(null);
      setError(null);
      setLoading(false);
      return;
    }
    // In focus-method mode, the center node IS the method — its source is
    // already in focusMethod.sourceCode, no fetch needed.
    if (isCurrentFocusMethod) {
      setSource(focusMethod?.sourceCode ?? "");
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
  }, [selectedNodeId, sessionId, isFocusPeripheral, isCurrentFocusMethod, focusMethod]);

  const canFocusScan =
    !!node &&
    sheetMode === "class" &&
    !isCurrentFocusClass &&
    !isCurrentFocusMethod &&
    !!projectPath &&
    !!node.filePath &&
    computeRelativeFocusFile(projectPath, node.filePath) !== null;

  const onFocusScanClass = async () => {
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
      const res = await analyzeFocus({ projectPath, focusFile: rel, demoMode });
      newSessionId = res.sessionId;
    } catch {
      setIsFocusing(false);
      return;
    }
    clearSelection();
    const params = new URLSearchParams({ mode: "focus" });
    if (demoMode === "pro") params.set("demo", "pro");
    router.replace(`/map/${newSessionId}?${params.toString()}`);
  };

  /** FOCO SCANER over a method — fires from the method-mode sheet. Uses the
   *  current focus class as the source file for the method. */
  const onFocusScanMethod = async () => {
    if (!selectedMethod || !focusClass || !projectPath || isFocusing) return;
    const rel = computeRelativeFocusFile(projectPath, focusClass.sourceFile);
    if (!rel) {
      toast.error("No se puede deducir el path relativo del archivo");
      return;
    }
    setIsFocusing(true);
    const demoMode = resolveDemoMode();
    let newSessionId: string;
    try {
      const res = await analyzeFocusMethod({
        projectPath,
        focusFile: rel,
        methodName: selectedMethod.name,
        demoMode,
      });
      newSessionId = res.sessionId;
    } catch {
      setIsFocusing(false);
      return;
    }
    clearSelection();
    const params = new URLSearchParams({ mode: "focus-method" });
    if (demoMode === "pro") params.set("demo", "pro");
    router.replace(`/map/${newSessionId}?${params.toString()}`);
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
        {node || isCurrentFocusMethod ? (
          <>
            <SheetHeaderForMode
              sheetMode={sheetMode}
              isCurrentFocusClass={isCurrentFocusClass}
              isCurrentFocusMethod={isCurrentFocusMethod}
              isFocusing={isFocusing}
              canFocusScan={canFocusScan}
              onFocusScanClass={onFocusScanClass}
              onFocusScanMethod={onFocusScanMethod}
              nodeName={node?.name ?? focusMethod?.containingClass ?? ""}
              nodeFqn={node?.fullyQualifiedName ?? ""}
              variable={selectedVariable}
              method={selectedMethod}
              focusMethodReturnType={focusMethod?.returnType}
              focusMethodName={focusMethod?.methodName}
            />

            {sheetMode === "class" && node && (
              <ClassView
                node={node}
                source={source}
                loading={loading}
                error={error}
                incoming={incoming}
                outgoing={outgoing}
                allNodes={allNodes}
                isFocusPeripheral={isFocusPeripheral}
                canFocusScan={canFocusScan}
                isFocusing={isFocusing}
                onFocusScan={onFocusScanClass}
                selectNode={selectNode}
              />
            )}
            {sheetMode === "variable" && selectedVariable && (
              <VariableView
                variable={selectedVariable}
                source={source}
                loading={loading}
              />
            )}
            {sheetMode === "method" && (selectedMethod || focusMethod) && (
              <MethodView
                method={selectedMethod}
                source={source}
                loading={loading}
                isCurrentFocusMethod={isCurrentFocusMethod}
                focusMethodSignature={focusMethod?.signature}
                focusConnectionsCount={
                  isCurrentFocusMethod ? focusConnections.length : 0
                }
              />
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────

function SheetHeaderForMode({
  sheetMode,
  isCurrentFocusClass,
  isCurrentFocusMethod,
  isFocusing,
  canFocusScan,
  onFocusScanClass,
  onFocusScanMethod,
  nodeName,
  nodeFqn,
  variable,
  method,
  focusMethodReturnType,
  focusMethodName,
}: {
  sheetMode: "class" | "variable" | "method";
  isCurrentFocusClass: boolean;
  isCurrentFocusMethod: boolean;
  isFocusing: boolean;
  canFocusScan: boolean;
  onFocusScanClass: () => void;
  onFocusScanMethod: () => void;
  nodeName: string;
  nodeFqn: string;
  variable: ParsedField | null;
  method: ParsedMethod | null;
  focusMethodReturnType?: string;
  focusMethodName?: string;
}) {
  if (sheetMode === "variable" && variable) {
    return (
      <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
              <FileCode className="h-5 w-5 text-[var(--bordo)]" />
              <span className="truncate font-mono text-base">
                <span className="text-[var(--silver-dark)]">{variable.type}</span>{" "}
                <span className="font-semibold">{variable.name}</span>
              </span>
            </SheetTitle>
            <SheetDescription className="truncate font-mono text-xs text-[var(--silver-dark)]">
              {nodeFqn}
            </SheetDescription>
          </div>
          <span className="shrink-0 self-start rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
            Variable
          </span>
        </div>
      </SheetHeader>
    );
  }

  if (sheetMode === "method") {
    const name = method?.name ?? focusMethodName ?? "";
    const ret = method?.returnType ?? focusMethodReturnType ?? "";
    const isConstructor = ret === "<constructor>";
    return (
      <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
              {isCurrentFocusMethod ? (
                <Crosshair
                  className="h-5 w-5 text-[var(--bordo)]"
                  strokeWidth={2.2}
                  style={{ filter: "drop-shadow(0 0 6px rgba(185,28,66,0.55))" }}
                />
              ) : (
                <FileCode className="h-5 w-5 text-[var(--bordo)]" />
              )}
              <span className="truncate font-mono text-base font-semibold">
                {name}()
                {!isConstructor && ret && (
                  <span className="text-[var(--silver-dark)]">: {ret}</span>
                )}
              </span>
            </SheetTitle>
            <SheetDescription className="truncate font-mono text-xs text-[var(--silver-dark)]">
              {nodeFqn}
            </SheetDescription>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-start">
            <span className="rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
              Método
            </span>
            {isCurrentFocusMethod ? (
              <span className="rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
                Método enfocado
              </span>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Button
                  size="sm"
                  onClick={onFocusScanMethod}
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
                      Foco Scaner
                    </>
                  )}
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </SheetHeader>
    );
  }

  // class mode (default)
  return (
    <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <SheetTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
            {isCurrentFocusClass ? (
              <Crosshair
                className="h-5 w-5 text-[var(--bordo)]"
                strokeWidth={2.2}
                style={{ filter: "drop-shadow(0 0 6px rgba(185,28,66,0.55))" }}
              />
            ) : (
              <FileCode className="h-5 w-5 text-[var(--bordo)]" />
            )}
            <span className="truncate font-semibold">{nodeName}</span>
          </SheetTitle>
          <SheetDescription className="truncate font-mono text-xs text-[var(--silver-dark)]">
            {nodeFqn}
          </SheetDescription>
        </div>

        {isCurrentFocusClass ? (
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
              onClick={onFocusScanClass}
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
  );
}

// ─────────────────────────────────────────────────────────────────────
// Class view (existing behaviour, lifted into a component)
// ─────────────────────────────────────────────────────────────────────

interface ClassViewProps {
  node: ClassNodeData;
  source: string | null;
  loading: boolean;
  error: string | null;
  incoming: Connection[];
  outgoing: Connection[];
  allNodes: Map<string, ClassNodeData>;
  isFocusPeripheral: boolean;
  canFocusScan: boolean;
  isFocusing: boolean;
  onFocusScan: () => void;
  selectNode: (id: string) => void;
}

function ClassView({
  node,
  source,
  loading,
  error,
  incoming,
  outgoing,
  allNodes,
  isFocusPeripheral,
  canFocusScan,
  isFocusing,
  onFocusScan,
  selectNode,
}: ClassViewProps) {
  return (
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
                  options={MONACO_OPTIONS}
                />
              )}
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="incoming" className="flex-1 px-6 pb-6 pt-4">
        <ConnectionList
          items={incoming.map((e) => ({ id: e.from, type: e.type, label: e.label }))}
          resolveName={(id) => allNodes.get(id)?.name ?? id.split(".").pop() ?? id}
          onJump={(id) => selectNode(id)}
        />
      </TabsContent>

      <TabsContent value="outgoing" className="flex-1 px-6 pb-6 pt-4">
        <ConnectionList
          items={outgoing.map((e) => ({ id: e.to, type: e.type, label: e.label }))}
          resolveName={(id) => allNodes.get(id)?.name ?? id.split(".").pop() ?? id}
          onJump={(id) => selectNode(id)}
        />
      </TabsContent>

      <TabsContent value="metrics" className="flex-1 px-6 pb-6 pt-4">
        <div className="flex flex-col gap-3 text-sm">
          <Metric label="Campos" value={node.fields.length} />
          <Metric label="Métodos" value={node.methods.length} />
          <Metric label="Líneas" value={node.lineCount} />
          <Metric label="Conexiones" value={incoming.length + outgoing.length} />
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
  );
}

// ─────────────────────────────────────────────────────────────────────
// Variable view — declaration line + every usage in the focus class
// ─────────────────────────────────────────────────────────────────────

function VariableView({
  variable,
  source,
  loading,
}: {
  variable: ParsedField;
  source: string | null;
  loading: boolean;
}) {
  const usages = useMemo(
    () => (source ? findVariableUsages(source, variable.name) : []),
    [source, variable.name],
  );

  if (loading || source === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-6">
        <Skeleton className="h-3/4 w-3/4" />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-5 px-6 py-4">
        <Section eyebrow="Declaración">
          <div className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-3">
            <code className="font-mono text-xs leading-relaxed">
              {variable.modifiers.length > 0 && (
                <span className="text-[var(--silver-dark)]">
                  {variable.modifiers.join(" ")}{" "}
                </span>
              )}
              <span className="text-[var(--silver)]">{variable.type}</span>{" "}
              <span className="font-semibold text-[var(--bordo)]">
                {variable.name}
              </span>
            </code>
            {variable.annotations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {variable.annotations.map((a, i) => (
                  <span
                    key={`${a}-${i}`}
                    className="rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--bordo)]"
                  >
                    {a.startsWith("@") ? a : `@${a}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section
          eyebrow={`Usos en la clase (${usages.length})`}
          subtitle={
            usages.length === 0
              ? "Esta variable no se referencia más allá de su declaración."
              : undefined
          }
        >
          <div className="flex flex-col gap-3">
            {usages.map((u, i) => (
              <UsageSnippet
                key={i}
                index={i + 1}
                usage={u}
                varName={variable.name}
              />
            ))}
          </div>
        </Section>
      </div>
    </ScrollArea>
  );
}

function UsageSnippet({
  index,
  usage,
  varName,
}: {
  index: number;
  usage: VariableUsage;
  varName: string;
}) {
  const re = useMemo(() => new RegExp(`\\b${escapeRegex(varName)}\\b`, "g"), [
    varName,
  ]);
  const lines = usage.snippet.split("\n");
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
        <span>
          Uso{" "}
          <span className="tabular-nums text-[var(--silver)]">{index}</span>
        </span>
        <span>
          línea{" "}
          <span className="tabular-nums text-[var(--silver)]">
            {usage.line}
          </span>
        </span>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--fg-primary)]">
        {lines.map((line, lineIdx) => {
          const lineNumber = usage.contextStartLine + lineIdx;
          const isMatch = lineNumber === usage.line;
          const parts: React.ReactNode[] = [];
          let last = 0;
          let m: RegExpExecArray | null;
          re.lastIndex = 0;
          while ((m = re.exec(line)) !== null) {
            if (m.index > last) parts.push(line.slice(last, m.index));
            parts.push(
              <span
                key={`${lineIdx}-${m.index}`}
                className="rounded-sm bg-[var(--bordo)]/20 px-0.5 font-semibold text-[var(--bordo)]"
              >
                {m[0]}
              </span>,
            );
            last = m.index + m[0].length;
          }
          if (last < line.length) parts.push(line.slice(last));
          return (
            <div key={lineIdx} className="flex gap-3">
              <span
                className={
                  isMatch
                    ? "shrink-0 select-none text-[var(--bordo)]"
                    : "shrink-0 select-none text-[var(--silver-dark)]"
                }
              >
                {String(lineNumber).padStart(4, " ")}
              </span>
              <span className={isMatch ? "" : "text-[var(--fg-secondary)]"}>
                {parts.length > 0 ? parts : line}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Method view — signature + body, optional callers (in focus-method)
// ─────────────────────────────────────────────────────────────────────

function MethodView({
  method,
  source,
  loading,
  isCurrentFocusMethod,
  focusMethodSignature,
  focusConnectionsCount,
}: {
  method: ParsedMethod | null;
  source: string | null;
  loading: boolean;
  isCurrentFocusMethod: boolean;
  focusMethodSignature?: string;
  focusConnectionsCount: number;
}) {
  // Body code: prefer the explicit source (already sliced to the method when
  // this is the focus method center). Otherwise slice the class source by the
  // method's start/end lines.
  const body = useMemo(() => {
    if (!source) return "";
    if (isCurrentFocusMethod) return source;
    if (!method) return "";
    return sliceMethodSource(source, method.startLine, method.endLine);
  }, [source, method, isCurrentFocusMethod]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-6">
        <Skeleton className="h-3/4 w-3/4" />
      </div>
    );
  }

  const signature =
    focusMethodSignature ??
    (method
      ? `${method.modifiers.join(" ")}${method.modifiers.length > 0 ? " " : ""}${
          method.returnType === "<constructor>" ? "" : method.returnType + " "
        }${method.name}(${method.parameters
          .map((p) => `${p.type} ${p.name}`)
          .join(", ")})`
      : "");

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-5 px-6 py-4">
        <Section eyebrow="Firma">
          <code className="block break-all rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs text-[var(--silver)]">
            {signature.trim()}
          </code>
        </Section>

        <Section eyebrow="Código">
          {body ? (
            <div className="h-[420px] overflow-hidden rounded-md border border-[var(--border-silver)] shadow-[var(--shadow-md)]">
              <MonacoEditor
                height="100%"
                defaultLanguage="java"
                value={body}
                theme="vs-dark"
                options={MONACO_OPTIONS}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--border-silver)] bg-[var(--bg-input)]/40 px-3 py-4 text-center text-xs text-[var(--fg-muted)]">
              No se pudo extraer el cuerpo del método.
            </div>
          )}
        </Section>

        <Section
          eyebrow={`Usado por (${focusConnectionsCount})`}
          subtitle={
            !isCurrentFocusMethod
              ? "Hacé click en FOCO SCANER para rastrear quién llama a este método."
              : focusConnectionsCount === 0
                ? "Este método no es invocado desde otra clase del proyecto."
                : "Las clases del grafo radial son las que invocan este método."
          }
        >
          {/* Empty section body — the data lives in the radial graph itself
              when in focus-method mode. We keep this here as a deliberate
              affordance so users learn what the FOCO SCANER does. */}
        </Section>
      </div>
    </ScrollArea>
  );
}

function Section({
  eyebrow,
  subtitle,
  children,
}: {
  eyebrow: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--silver-dark)]">
          {eyebrow}
        </span>
      </div>
      {subtitle && (
        <p className="text-xs text-[var(--fg-muted)]">{subtitle}</p>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────

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
