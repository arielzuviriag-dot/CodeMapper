"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Box,
  ChevronRight,
  CircleDashed,
  CircleDot,
  Crosshair,
  FileCode,
  GitBranch,
  Hash,
  Loader2,
  Shapes,
  Square,
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
import { FocusScanConfirmModal } from "@/components/loading/FocusScanConfirmModal";
import { useGraphStore } from "@/store/graphStore";
import {
  analyzeFocus,
  analyzeFocusMethod,
  getClassSource,
  resolveDemoMode,
} from "@/lib/api";
import type {
  ClassKind,
  ClassNodeData,
  Connection,
  FocusConnectionPayload,
  ParsedField,
  ParsedMethod,
} from "@/lib/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const MONACO_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: "'JetBrains Mono', var(--font-geist-mono), monospace",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  renderLineHighlight: "gutter",
  smoothScrolling: true,
  wordWrap: "off",
  scrollbar: {
    horizontal: "visible",
    vertical: "visible",
    horizontalScrollbarSize: 10,
    verticalScrollbarSize: 10,
    alwaysConsumeMouseWheel: false,
  },
  // Find widget — never seed the search box from the cursor/selection so it
  // opens empty (without "package", the first word, etc.).
  find: {
    seedSearchStringFromSelection: "never",
    autoFindInSelection: "never",
    addExtraSpaceOnTop: false,
  },
} as const;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find 1-based line numbers in `body` that mention either the called class
 *  or method. Methods are matched as call sites (`name(`); classes match any
 *  identifier reference, including the conventional lowerCamelCase variant
 *  used for fields and locals (e.g. `AuthService` → also matches `authService`).
 *  Without that, we'd only flag the type declaration line and miss the actual
 *  invocation lines like `authService.foo()`. Empty array when neither token
 *  is provided. */
function findCallSiteLines(
  body: string,
  highlight: { className?: string | null; methodName?: string | null } | null,
): number[] {
  if (!body || !highlight) return [];
  const { className, methodName } = highlight;
  if (!className && !methodName) return [];
  const methodRe = methodName
    ? new RegExp(`\\b${escapeRegex(methodName)}\\s*\\(`)
    : null;
  // Build an alternation that catches both the type form and the field-name
  // form. Java fields/locals overwhelmingly use the lowerCamelCase of the
  // class name, so highlighting both surfaces the actual call sites.
  const classRe = className
    ? new RegExp(
        `\\b(?:${escapeRegex(className)}|${escapeRegex(
          className.charAt(0).toLowerCase() + className.slice(1),
        )})\\b`,
      )
    : null;
  const lines = body.split("\n");
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if ((methodRe && methodRe.test(line)) || (classRe && classRe.test(line))) {
      hits.push(i + 1);
    }
  }
  return hits;
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

  const setPendingReanalysis = useGraphStore((s) => s.setPendingReanalysis);

  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocusing, setIsFocusing] = useState(false);

  /** Confirmation step before re-analyzing. The pending action is captured
   *  in a closure so the modal stays decoupled from class- vs method-scan
   *  details — it just calls back when the user accepts. */
  const [confirm, setConfirm] = useState<{
    label: string;
    run: () => Promise<void>;
  } | null>(null);

  const isCurrentFocusClass =
    focusMode && focusClass !== null && focusClass.id === selectedNodeId;
  const isCurrentFocusMethod =
    focusMethodMode && focusMethod !== null && focusMethod.id === selectedNodeId;

  // Incoming/outgoing for the regular class graph come from `allEdges` (the
  // store's flat edge list). In FOCO mode that list is empty — connections
  // live in `focusConnections` instead — so we derive both from there when
  // the user opens the sheet on the focus class itself. Without this, the
  // Entrantes/Salientes tabs would always read (0) in FOCO.
  const incoming = useMemo<Connection[]>(() => {
    if (isCurrentFocusClass && focusClass) {
      return focusConnections
        .filter((c) => c.connectionType === "CALLED_BY")
        .map((c) => ({
          from: c.id,
          to: focusClass.id,
          type: "METHOD_CALL",
          label: c.viaMethodInSource ?? c.name,
        }));
    }
    return allEdges.filter((e) => e.to === selectedNodeId);
  }, [allEdges, selectedNodeId, isCurrentFocusClass, focusClass, focusConnections]);

  const outgoing = useMemo<Connection[]>(() => {
    if (isCurrentFocusClass && focusClass) {
      return focusConnections
        .filter(
          (c) =>
            c.connectionType === "CALLS" ||
            c.connectionType === "EXTENDS" ||
            c.connectionType === "IMPLEMENTS" ||
            c.connectionType === "USES_PROPERTIES",
        )
        .map((c) => ({
          from: focusClass.id,
          to: c.id,
          type:
            c.connectionType === "EXTENDS"
              ? "EXTENDS"
              : c.connectionType === "IMPLEMENTS"
                ? "IMPLEMENTS"
                : c.connectionType === "USES_PROPERTIES"
                  ? "ANNOTATION_USAGE"
                  : "METHOD_CALL",
          label: c.viaMethodInSource ?? c.name,
        }));
    }
    return allEdges.filter((e) => e.from === selectedNodeId);
  }, [allEdges, selectedNodeId, isCurrentFocusClass, focusClass, focusConnections]);

  // Fetch class source — only for class-mode views, OR when we need to slice
  // a method body from the class file (variable/method modes on a regular class).
  useEffect(() => {
    if (!selectedNodeId || !sessionId) {
      setSource(null);
      setError(null);
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
    // [debug] flagging while we stabilise focus mode — remove once stable
    console.log("[CodeMapper] sheet fetch source:", selectedNodeId);
    let cancelled = false;
    setLoading(true);
    setSource(null);
    setError(null);
    getClassSource(sessionId, selectedNodeId)
      .then((res) => {
        if (cancelled) return;
        // [debug] flagging while we stabilise focus mode — remove once stable
        console.log(
          "[CodeMapper] sheet source resolved:",
          selectedNodeId,
          res?.sourceCode?.length ?? 0,
          "chars",
        );
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
  }, [selectedNodeId, sessionId, isCurrentFocusMethod, focusMethod]);

  const canFocusScan =
    !!node &&
    sheetMode === "class" &&
    !isCurrentFocusClass &&
    !isCurrentFocusMethod &&
    !!projectPath &&
    !!node.filePath &&
    computeRelativeFocusFile(projectPath, node.filePath) !== null;

  const requestFocusScanClass = () => {
    if (!node || !projectPath || isFocusing) return;
    const rel = computeRelativeFocusFile(projectPath, node.filePath);
    if (!rel) {
      toast.error("No se puede deducir el path relativo del archivo");
      return;
    }
    setConfirm({
      label: node.name,
      run: async () => {
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
          setIsFocusing(false);
          return;
        }
        // Flip the flag BEFORE navigating so the next map render swaps the
        // full-screen loader for the inline one.
        setPendingReanalysis(true);
        clearSelection();
        const params = new URLSearchParams({ mode: "focus" });
        if (demoMode === "pro") params.set("demo", "pro");
        router.replace(`/map/${newSessionId}?${params.toString()}`);
      },
    });
  };

  /** FOCO SCANER over a method — fires from the method-mode sheet. Uses the
   *  current focus class as the source file for the method. */
  const requestFocusScanMethod = () => {
    if (!selectedMethod || !focusClass || !projectPath || isFocusing) return;
    const rel = computeRelativeFocusFile(projectPath, focusClass.sourceFile);
    if (!rel) {
      toast.error("No se puede deducir el path relativo del archivo");
      return;
    }
    setConfirm({
      label: `${focusClass.name}.${selectedMethod.name}()`,
      run: async () => {
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
        setPendingReanalysis(true);
        clearSelection();
        const params = new URLSearchParams({ mode: "focus-method" });
        if (demoMode === "pro") params.set("demo", "pro");
        router.replace(`/map/${newSessionId}?${params.toString()}`);
      },
    });
  };

  const onConfirmFocusScan = () => {
    const target = confirm;
    setConfirm(null);
    target?.run();
  };

  const isProForModal =
    typeof window !== "undefined" && resolveDemoMode() === "pro";

  return (
    <>
    <FocusScanConfirmModal
      open={confirm !== null}
      targetLabel={confirm?.label ?? ""}
      isPro={isProForModal}
      onCancel={() => setConfirm(null)}
      onConfirm={onConfirmFocusScan}
    />
    <Sheet
      open={!!selectedNodeId}
      onOpenChange={(open) => {
        if (!open) clearSelection();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col border-l border-[var(--border-silver)] bg-[var(--bg-card)] p-0 sm:max-w-4xl xl:max-w-[64vw]"
      >
        {node || isCurrentFocusMethod ? (
          <>
            <SheetHeaderForMode
              sheetMode={sheetMode}
              isCurrentFocusClass={isCurrentFocusClass}
              isCurrentFocusMethod={isCurrentFocusMethod}
              isFocusing={isFocusing}
              canFocusScan={canFocusScan}
              onFocusScanClass={requestFocusScanClass}
              onFocusScanMethod={requestFocusScanMethod}
              nodeName={node?.name ?? focusMethod?.containingClass ?? ""}
              nodeFqn={node?.fullyQualifiedName ?? ""}
              classType={node?.type ?? null}
              lineCount={node?.lineCount ?? 0}
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────

const KIND_META: Record<
  ClassKind,
  { label: string; Icon: typeof Box }
> = {
  CLASS: { label: "Clase", Icon: Box },
  INTERFACE: { label: "Interface", Icon: CircleDashed },
  ENUM: { label: "Enum", Icon: Shapes },
  RECORD: { label: "Record", Icon: CircleDot },
  ABSTRACT_CLASS: { label: "Abstract", Icon: Square },
};

/** Compact metadata chip — class kind + line count. Sits next to the FOCO
 *  SCANER button so the user can read the validation surface (what kind of
 *  Java type, how many lines) at a glance before triggering a scan. */
function KindBadge({
  kind,
  lineCount,
}: {
  kind: ClassKind;
  lineCount: number;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.Icon;
  return (
    <span
      className="flex items-center gap-1.5 rounded-sm border border-[var(--border-silver)] bg-[var(--bg-input)] px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--silver)]"
      title={`${meta.label} · ${lineCount} líneas`}
    >
      <Icon className="h-3 w-3 text-[var(--bordo)]" />
      <span>{meta.label}</span>
      {lineCount > 0 && (
        <>
          <span className="text-[var(--border-silver)]">·</span>
          <span className="tabular-nums normal-case tracking-tight text-[var(--silver-dark)]">
            {lineCount} <span className="lowercase">líneas</span>
          </span>
        </>
      )}
    </span>
  );
}

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
  classType,
  lineCount,
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
  classType: ClassKind | null;
  lineCount: number;
  variable: ParsedField | null;
  method: ParsedMethod | null;
  focusMethodReturnType?: string;
  focusMethodName?: string;
}) {
  if (sheetMode === "variable" && variable) {
    return (
      <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] py-4 pl-6 pr-12">
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
      <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] py-4 pl-6 pr-12">
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
    <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] py-4 pl-6 pr-12">
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

        <div className="flex shrink-0 items-center gap-2 self-start">
          {classType && <KindBadge kind={classType} lineCount={lineCount} />}
          {isCurrentFocusClass ? (
            <span className="rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
              Clase enfocada
            </span>
          ) : canFocusScan ? (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
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
  selectNode,
}: ClassViewProps) {
  // Highlight token from the store (set by FocusEdge's "via import" / "desde
  // uso interno" / "invocación oblicua" fallback chips). When present, we
  // mark every line in this class's source that mentions the token — the
  // import line at the top + any textual reference inside the body.
  const highlight = useGraphStore((s) => s.methodSheetHighlight);
  const highlightLines = useMemo(
    () => findCallSiteLines(source ?? "", highlight),
    [source, highlight],
  );
  // Refs to apply Monaco line decorations on mount and whenever the
  // highlight target changes. Same pattern as MethodView's editor.
  type EditorRef = {
    deltaDecorations: (
      old: string[],
      n: { range: unknown; options: unknown }[],
    ) => string[];
    revealLineInCenterIfOutsideViewport?: (line: number) => void;
  };
  type MonacoNs = {
    Range: new (a: number, b: number, c: number, d: number) => unknown;
  };
  const classEditorRef = useRef<EditorRef | null>(null);
  const classMonacoRef = useRef<MonacoNs | null>(null);
  const classDecorationsRef = useRef<string[]>([]);

  useEffect(() => {
    const editor = classEditorRef.current;
    const monaco = classMonacoRef.current;
    if (!editor || !monaco) return;
    const newDecs = highlightLines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: "cm-call-site-line",
        linesDecorationsClassName: "cm-call-site-glyph",
      },
    }));
    classDecorationsRef.current = editor.deltaDecorations(
      classDecorationsRef.current,
      newDecs,
    );
    if (highlightLines.length > 0 && editor.revealLineInCenterIfOutsideViewport) {
      editor.revealLineInCenterIfOutsideViewport(highlightLines[0]);
    }
  }, [highlightLines]);

  // Tabs simplified to Código + Métricas only — Entrantes/Salientes tabs
  // were removed (no real value: the relationships are already visible in
  // the graph itself, and on a peripheral they'd be empty anyway).
  const tabs = [
    { v: "source", label: "Código" },
    { v: "metrics", label: "Métricas" },
  ];

  // Accordion-style expansion for the metrics tab. One section open at a
  // time — clicking the same metric again collapses it.
  const [expandedMetric, setExpandedMetric] = useState<
    "fields" | "methods" | "connections" | "complexity" | null
  >(null);
  const toggleMetric = (key: NonNullable<typeof expandedMetric>) =>
    setExpandedMetric((prev) => (prev === key ? null : key));

  // Connection counts and breakdown — when this is the focus class we use
  // focusConnections directly so the list is meaningful in FOCO. Otherwise
  // fall back to the regular incoming/outgoing arrays (the project-wide
  // graph). Empty for FOCO peripherals — the row stays clickable but the
  // expanded list will explain there's no data.
  const focusModeFlag = useGraphStore((s) => s.focusMode);
  const focusClassFromStore = useGraphStore((s) => s.focusClass);
  const isFocusClass =
    focusModeFlag && focusClassFromStore?.id === node.id;
  const focusConnsForNode = useGraphStore((s) => s.focusConnections);
  const isPro = useGraphStore((s) => s.isPro);
  const limitReached = useGraphStore((s) => s.limitReached);
  const connectionsCount = isFocusClass
    ? focusConnsForNode.length
    : incoming.length + outgoing.length;
  // FREE cap awareness — when the backend trimmed the connection list, we
  // surface that on both the Conexiones and Complejidad rows so the dev
  // doesn't read "10" as the absolute truth.
  const isCappedByFree =
    isFocusClass && !isPro && limitReached.reached && limitReached.totalAvailable > 0;
  const realConnectionsCount = isCappedByFree
    ? limitReached.totalAvailable
    : connectionsCount;
  const complexity =
    node.fields.length + node.methods.length + connectionsCount;
  const realComplexity =
    node.fields.length + node.methods.length + realConnectionsCount;
  return (
    <Tabs defaultValue="source" className="flex flex-1 flex-col overflow-hidden">
      <TabsList className="mx-6 mt-4 grid grid-cols-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-1">
        {tabs.map((t) => (
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
                options={MONACO_OPTIONS}
                onMount={(editor, monaco) => {
                  classEditorRef.current = editor as unknown as EditorRef;
                  classMonacoRef.current = monaco as unknown as MonacoNs;
                  // Apply current decorations on first mount.
                  if (highlightLines.length > 0) {
                    classDecorationsRef.current = (
                      editor as unknown as EditorRef
                    ).deltaDecorations(
                      [],
                      highlightLines.map((line) => ({
                        range: new (monaco as unknown as MonacoNs).Range(
                          line,
                          1,
                          line,
                          1,
                        ),
                        options: {
                          isWholeLine: true,
                          className: "cm-call-site-line",
                          linesDecorationsClassName: "cm-call-site-glyph",
                        },
                      })),
                    );
                    if (
                      (editor as unknown as EditorRef)
                        .revealLineInCenterIfOutsideViewport
                    ) {
                      (
                        editor as unknown as EditorRef
                      ).revealLineInCenterIfOutsideViewport!(highlightLines[0]);
                    }
                  }
                  // Open Monaco's Find widget on mount so the user can search
                  // within the source without hitting Ctrl+F first.
                  setTimeout(() => {
                    const action = (editor as unknown as {
                      getAction: (id: string) => { run: () => void } | null;
                    }).getAction("actions.find");
                    action?.run();
                  }, 50);
                }}
              />
            )}
          </div>
        </div>
      </TabsContent>


      <TabsContent value="metrics" className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
        <div className="flex flex-col gap-3 text-sm">
          <ExpandableMetric
            label="Campos"
            value={node.fields.length}
            active={expandedMetric === "fields"}
            onToggle={() => toggleMetric("fields")}
          >
            <FieldsList fields={node.fields} />
          </ExpandableMetric>

          <ExpandableMetric
            label="Métodos"
            value={node.methods.length}
            active={expandedMetric === "methods"}
            onToggle={() => toggleMetric("methods")}
          >
            <MethodsList methods={node.methods} />
          </ExpandableMetric>

          <ExpandableMetric
            label="Conexiones"
            value={connectionsCount}
            cappedTotal={isCappedByFree ? realConnectionsCount : undefined}
            active={expandedMetric === "connections"}
            onToggle={() => toggleMetric("connections")}
          >
            {isCappedByFree && (
              <FreeCapNotice
                shown={connectionsCount}
                total={realConnectionsCount}
                what="conexiones"
              />
            )}
            <ConnectionsList
              isFocusClass={isFocusClass}
              focusConnections={focusConnsForNode}
              focusMethods={node.methods}
            />
          </ExpandableMetric>

          <ExpandableMetric
            label="Complejidad estimada"
            value={complexity}
            cappedTotal={isCappedByFree ? realComplexity : undefined}
            active={expandedMetric === "complexity"}
            onToggle={() => toggleMetric("complexity")}
          >
            {isCappedByFree && (
              <FreeCapNotice
                shown={complexity}
                total={realComplexity}
                what="el total real"
              />
            )}
            <ComplexityBreakdown
              fields={node.fields.length}
              methods={node.methods.length}
              connections={connectionsCount}
              total={complexity}
              realConnections={isCappedByFree ? realConnectionsCount : undefined}
              realTotal={isCappedByFree ? realComplexity : undefined}
            />
          </ExpandableMetric>

          <Separator className="my-2 bg-[var(--border-silver)]" />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
              Path
            </span>
            <code className="break-all rounded-sm border border-[var(--border-silver)] bg-[var(--bg-input)] px-2 py-1.5 font-mono text-xs text-[var(--silver)]">
              {node.filePath}
            </code>
          </div>
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
  const highlight = useGraphStore((s) => s.methodSheetHighlight);
  // Body code: prefer the explicit source (already sliced to the method when
  // this is the focus method center). Otherwise slice the class source by the
  // method's start/end lines.
  const body = useMemo(() => {
    if (!source) return "";
    if (isCurrentFocusMethod) return source;
    if (!method) return "";
    return sliceMethodSource(source, method.startLine, method.endLine);
  }, [source, method, isCurrentFocusMethod]);

  const callSiteLines = useMemo(
    () => findCallSiteLines(body, highlight),
    [body, highlight],
  );

  // Refs to the Monaco instance so we can re-apply decorations when the body
  // (or the highlight target) changes without remounting the editor.
  // Typed loosely to dodge importing monaco types at the call site.
  type EditorRef = {
    deltaDecorations: (
      old: string[],
      n: { range: unknown; options: unknown }[],
    ) => string[];
    revealLineInCenterIfOutsideViewport?: (line: number) => void;
  };
  type MonacoNs = { Range: new (a: number, b: number, c: number, d: number) => unknown };
  const editorRef = useRef<EditorRef | null>(null);
  const monacoRef = useRef<MonacoNs | null>(null);
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const newDecs = callSiteLines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: "cm-call-site-line",
        linesDecorationsClassName: "cm-call-site-glyph",
      },
    }));
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecs,
    );
    if (callSiteLines.length > 0 && editor.revealLineInCenterIfOutsideViewport) {
      editor.revealLineInCenterIfOutsideViewport(callSiteLines[0]);
    }
  }, [callSiteLines, body]);

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
                onMount={(editor, monaco) => {
                  editorRef.current = editor as unknown as EditorRef;
                  monacoRef.current = monaco as unknown as MonacoNs;
                  // Apply current decorations on first mount.
                  if (callSiteLines.length > 0) {
                    decorationsRef.current = (editor as unknown as EditorRef).deltaDecorations(
                      [],
                      callSiteLines.map((line) => ({
                        range: new (monaco as unknown as MonacoNs).Range(line, 1, line, 1),
                        options: {
                          isWholeLine: true,
                          className: "cm-call-site-line",
                          linesDecorationsClassName: "cm-call-site-glyph",
                        },
                      })),
                    );
                  }
                  // Open the Find widget by default — the dev shouldn't have
                  // to remember Ctrl+F to start searching the body.
                  setTimeout(() => {
                    const action = (editor as unknown as {
                      getAction: (id: string) => { run: () => void } | null;
                    }).getAction("actions.find");
                    action?.run();
                  }, 50);
                }}
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

/** Click-to-expand metric row. The header looks like {@link Metric}; when
 *  active, children render in a panel below. When `cappedTotal` is provided,
 *  the row reads as `value / cappedTotal` with a small "FREE" pill so the
 *  user knows the displayed value is trimmed. */
function ExpandableMetric({
  label,
  value,
  cappedTotal,
  active,
  onToggle,
  children,
}: {
  label: string;
  value: number;
  cappedTotal?: number;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const isCapped = typeof cappedTotal === "number" && cappedTotal > value;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        title={
          isCapped
            ? `Estás viendo ${value} de ${cappedTotal} (cap del plan FREE)`
            : undefined
        }
        className={`flex items-center justify-between rounded-md border bg-[var(--bg-input)] px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60 ${
          active
            ? "border-[var(--bordo)] shadow-[0_0_14px_rgba(185,28,66,0.18)]"
            : "border-[var(--border-silver)] hover:border-[var(--bordo)]/60"
        }`}
      >
        <div className="flex items-center gap-2 text-[var(--silver-dark)]">
          <Hash className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {isCapped ? (
            <>
              <span className="font-mono text-base font-semibold tabular-nums text-[var(--fg-primary)]">
                {value}
              </span>
              <span className="font-mono text-xs tabular-nums text-[var(--silver-dark)]">
                / {cappedTotal}
              </span>
              <span className="rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--bordo)]">
                Free
              </span>
            </>
          ) : (
            <span className="font-mono text-base font-semibold tabular-nums text-[var(--fg-primary)]">
              {value}
            </span>
          )}
          <ChevronRight
            className={`h-3.5 w-3.5 text-[var(--silver-dark)] transition-transform ${
              active ? "rotate-90 text-[var(--bordo)]" : ""
            }`}
          />
        </div>
      </button>
      {active && (
        <div className="mt-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-3">
          {children}
        </div>
      )}
    </div>
  );
}

/** Educational notice rendered inside an expanded metric panel when the
 *  number is capped by the FREE plan. Honest about the gap and points the
 *  user toward upgrading. */
function FreeCapNotice({
  shown,
  total,
  what,
}: {
  shown: number;
  total: number;
  what: string;
}) {
  return (
    <div className="mb-2 rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-2 py-1.5 text-[10px] leading-snug text-[var(--bordo)]">
      Estás viendo <span className="font-semibold">{shown} de {total}</span>{" "}
      {what}. El plan FREE recorta a 10 conexiones; con PRO ves todas.
    </div>
  );
}

/** Plain-text list of fields: `tipo` `nombre` (+ annotations). Read-only. */
function FieldsList({ fields }: { fields: ParsedField[] }) {
  if (fields.length === 0) {
    return (
      <span className="text-xs text-[var(--fg-muted)]">Sin campos.</span>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {fields.map((f) => (
        <li
          key={f.name}
          className="flex flex-wrap items-baseline gap-2 font-mono text-[11px] leading-tight"
        >
          <span className="text-[var(--silver-dark)]">{f.type}</span>
          <span className="text-[var(--fg-primary)]">{f.name}</span>
          {f.annotations.length > 0 && (
            <span className="text-[var(--bordo)]">
              {f.annotations.map((a) => (a.startsWith("@") ? a : `@${a}`)).join(" ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Plain-text list of methods: `nombre(params)` `: returnType` (+ annotations). */
function MethodsList({ methods }: { methods: ParsedMethod[] }) {
  if (methods.length === 0) {
    return (
      <span className="text-xs text-[var(--fg-muted)]">Sin métodos.</span>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {methods.map((m) => (
        <li
          key={`${m.name}-${m.startLine ?? 0}`}
          className="flex flex-wrap items-baseline gap-1 font-mono text-[11px] leading-tight"
        >
          <span className="text-[var(--fg-primary)]">{m.name}</span>
          <span className="text-[var(--fg-muted)]">
            (
            {m.parameters
              .map((p) => `${p.type} ${p.name}`)
              .join(", ")}
            )
          </span>
          {m.returnType && m.returnType !== "<constructor>" && (
            <span className="text-[var(--silver-dark)]">: {m.returnType}</span>
          )}
          {m.annotations.length > 0 && (
            <span className="text-[var(--bordo)]">
              {m.annotations.map((a) => (a.startsWith("@") ? a : `@${a}`)).join(" ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Connection details for the focus class — for each peripheral, surfaces:
 *  the class name, the connection type ("Llama a", "Llamado por", etc.),
 *  the method that mediates the relationship, and that method's parameters. */
function ConnectionsList({
  isFocusClass,
  focusConnections,
  focusMethods,
}: {
  isFocusClass: boolean;
  focusConnections: FocusConnectionPayload[];
  focusMethods: ParsedMethod[];
}) {
  if (!isFocusClass) {
    return (
      <span className="text-xs text-[var(--fg-muted)]">
        Las conexiones se listan solo cuando esta clase es el foco actual.
      </span>
    );
  }
  if (focusConnections.length === 0) {
    return (
      <span className="text-xs text-[var(--fg-muted)]">Sin conexiones.</span>
    );
  }
  const typeLabel = (ct: string) => {
    switch (ct) {
      case "CALLS":
        return "Llama a";
      case "CALLED_BY":
        return "Llamado por";
      case "EXTENDS":
        return "Extiende";
      case "IMPLEMENTS":
        return "Implementa";
      case "USES_PROPERTIES":
        return "Usa props";
      case "INVOKES_METHOD":
        return "Invocado";
      case "INVOKES_OUTGOING":
        return "Invoca";
      default:
        return ct;
    }
  };
  return (
    <ul className="flex flex-col gap-2.5">
      {focusConnections.map((c) => {
        // Resolve the method that owns the relationship and its parameters:
        // for CALLS/INVOKES_OUTGOING the method lives on the focus, for
        // CALLED_BY/INVOKES_METHOD it lives on the peripheral.
        const livesOnFocus =
          c.connectionType === "CALLS" || c.connectionType === "INVOKES_OUTGOING";
        const methodName =
          c.connectionType === "INVOKES_OUTGOING" && c.viaMethodInTarget
            ? c.viaMethodInTarget
            : c.viaMethodInSource ?? null;
        const methodObj = methodName
          ? livesOnFocus
            ? focusMethods.find((m) => m.name === methodName)
            : c.methods.find((m) => m.name === methodName)
          : null;
        return (
          <li
            key={c.id}
            className="flex flex-col gap-0.5 font-mono text-[11px] leading-tight"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[var(--fg-primary)]">{c.name}</span>
              <span className="rounded-sm border border-[var(--bordo)]/30 bg-[var(--bordo)]/10 px-1 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[var(--bordo)]">
                {typeLabel(c.connectionType)}
              </span>
            </div>
            {methodName && (
              <div className="pl-2 text-[var(--silver)]">
                <span className="text-[var(--fg-muted)]">↳ </span>
                {methodName}
                <span className="text-[var(--fg-muted)]">
                  (
                  {methodObj
                    ? methodObj.parameters
                        .map((p) => `${p.type} ${p.name}`)
                        .join(", ")
                    : ""}
                  )
                </span>
                {methodObj?.returnType &&
                  methodObj.returnType !== "<constructor>" && (
                    <span className="text-[var(--silver-dark)]">
                      : {methodObj.returnType}
                    </span>
                  )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Read-only breakdown of the complexity score so the user knows how it
 *  was computed. Mirrors `complexity = fields + methods + connections`.
 *  When `realConnections`/`realTotal` are provided, the row also surfaces
 *  the un-capped values next to the FREE-trimmed ones so the dev sees both
 *  numbers side by side. */
function ComplexityBreakdown({
  fields,
  methods,
  connections,
  total,
  realConnections,
  realTotal,
}: {
  fields: number;
  methods: number;
  connections: number;
  total: number;
  realConnections?: number;
  realTotal?: number;
}) {
  const hasRealNumbers =
    typeof realConnections === "number" && typeof realTotal === "number";
  return (
    <div className="flex flex-col gap-1.5 font-mono text-[11px] leading-tight">
      <p className="text-[10px] text-[var(--fg-muted)]">
        Suma simple de las dimensiones contables. Sirve como índice rápido,
        no es métrica formal.
      </p>
      <ul className="flex flex-col gap-1">
        <li className="flex justify-between">
          <span className="text-[var(--silver-dark)]">campos</span>
          <span className="tabular-nums text-[var(--fg-primary)]">{fields}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-[var(--silver-dark)]">métodos</span>
          <span className="tabular-nums text-[var(--fg-primary)]">{methods}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-[var(--silver-dark)]">conexiones</span>
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-[var(--fg-primary)]">{connections}</span>
            {hasRealNumbers && realConnections! > connections && (
              <span className="text-[10px] text-[var(--bordo)]">
                (real: {realConnections})
              </span>
            )}
          </span>
        </li>
        <li className="flex justify-between border-t border-[var(--border-silver)] pt-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--bordo)]">
            total
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="tabular-nums font-semibold text-[var(--bordo)]">
              {total}
            </span>
            {hasRealNumbers && realTotal! > total && (
              <span className="text-[10px] text-[var(--bordo)]">
                (real: {realTotal})
              </span>
            )}
          </span>
        </li>
      </ul>
    </div>
  );
}

