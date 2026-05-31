"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Coffee,
  FileCode,
  Globe,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { analyzeMethodCalls, resolveJavaSource, type MethodCall } from "@/lib/api";
import { useListeningStore } from "@/store/listeningStore";
import type { ClassNode } from "@/lib/trace";

/** Icon for a node in the order list — error / screen (web·mobile) / http / java. */
function NodeIcon({ n }: { n: ClassNode }) {
  if (n.status === "ERROR")
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#FCA5A5]" />;
  if (n.isScreen)
    return n.screenKind === "mobile" ? (
      <Smartphone className="h-3.5 w-3.5 shrink-0" style={{ color: "#0F9D58" }} />
    ) : (
      <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: "#2F81F7" }} />
    );
  if (n.isHttp)
    return <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--silver)]" />;
  return <Coffee className="h-3.5 w-3.5 shrink-0 text-[var(--bordo)]" />;
}

/**
 * Live "Escuchando" order panel — a left, see-through frame listing the objects
 * in the order they were called. Click an item to highlight it in the graph
 * and read its detail: methods observed, who it calls / is called by, and —
 * when it threw — where it broke.
 */
export function ListeningOrderPanel() {
  const nodes = useListeningStore((s) => s.nodes);
  const edges = useListeningStore((s) => s.edges);
  const highlight = useListeningStore((s) => s.highlight);
  const setHighlight = useListeningStore((s) => s.setHighlight);
  const selectError = useListeningStore((s) => s.selectError);
  const backendPath = useListeningStore((s) => s.backendPath);
  const openSource = useListeningStore((s) => s.openSource);

  // Per-method static call sites (expanded under a method in the detail).
  const [openMethod, setOpenMethod] = useState<string | null>(null);
  const [methodCalls, setMethodCalls] = useState<MethodCall[]>([]);
  const [loadingMethod, setLoadingMethod] = useState(false);

  // Reset the expanded method when the selected object changes.
  useEffect(() => {
    setOpenMethod(null);
    setMethodCalls([]);
  }, [highlight]);

  const toggleMethod = async (fqcn: string | null, method: string) => {
    if (openMethod === method) {
      setOpenMethod(null);
      return;
    }
    setOpenMethod(method);
    setMethodCalls([]);
    if (!fqcn) return;
    if (!backendPath) {
      toast.message("Agregá la ruta del backend al Iniciar para ver las llamadas");
      return;
    }
    setLoadingMethod(true);
    try {
      setMethodCalls(await analyzeMethodCalls(backendPath, fqcn, method));
    } catch {
      toast.error("No se pudo analizar el método");
    } finally {
      setLoadingMethod(false);
    }
  };

  const viewSource = async (n: ClassNode) => {
    if (!n.fqcn) return;
    if (!backendPath) {
      toast.message("Agregá la ruta del backend al Iniciar para ver el código");
      return;
    }
    try {
      const res = await resolveJavaSource(backendPath, n.fqcn);
      if (res.found && res.source != null) {
        openSource({ title: n.className, source: res.source, path: res.filePath ?? "" });
      } else {
        toast.error(`No encontré el archivo de ${n.className} en el backend`);
      }
    } catch {
      toast.error("No se pudo leer el código");
    }
  };

  if (nodes.length === 0) return null;

  const ordered = [...nodes].sort((a, b) => a.order - b.order);
  const sel = nodes.find((n) => n.className === highlight) ?? null;
  const outgoing = sel ? edges.filter((e) => e.source === sel.className) : [];
  const incoming = sel ? edges.filter((e) => e.target === sel.className) : [];

  return (
    <div className="pointer-events-auto absolute left-3 top-[64px] z-20 flex max-h-[calc(100vh-90px)] w-[300px] flex-col overflow-hidden rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)]/60 shadow-[var(--shadow-lg)] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[var(--border-silver)] px-3 py-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver)]">
          Orden de llamadas
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[var(--silver-dark)]">
          {ordered.length}
        </span>
      </div>

      <ol className="flex flex-col gap-0.5 overflow-y-auto p-1.5">
        {ordered.map((n) => {
          const active = n.className === highlight;
          return (
            <li key={n.className}>
              <button
                type="button"
                onClick={() => setHighlight(active ? null : n.className)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  active
                    ? "bg-[var(--bordo)]/20 ring-1 ring-[var(--bordo)]/60"
                    : "hover:bg-[var(--bg-panel)]"
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bordo)]/20 font-mono text-[10px] font-bold tabular-nums text-[var(--bordo)] ring-1 ring-[var(--bordo)]/40">
                  {n.order}
                </span>
                <NodeIcon n={n} />
                <span className="truncate font-mono text-[11px] text-[var(--fg-primary)]">
                  {n.className}
                </span>
                {n.hitCount > 1 && (
                  <span className="ml-auto shrink-0 font-mono text-[9px] tabular-nums text-[var(--silver-dark)]">
                    ×{n.hitCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {/* Detail of the selected object */}
      {sel && (
        <div className="flex max-h-[42%] flex-col gap-2 overflow-y-auto border-t border-[var(--border-silver)] bg-[var(--bg-base)]/50 p-3">
          <div className="flex items-center gap-2">
            <NodeIcon n={sel} />
            <span className="truncate font-mono text-xs font-semibold text-[var(--fg-primary)]">
              {sel.className}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
              #{sel.order}
            </span>
          </div>

          {sel.fqcn && (
            <button
              type="button"
              onClick={() => viewSource(sel)}
              className="flex items-center gap-1.5 self-start rounded-sm border border-[var(--border-silver)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver)] transition-colors hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
            >
              <FileCode className="h-3 w-3" /> Ver código
            </button>
          )}

          {sel.status === "ERROR" && (
            <button
              type="button"
              onClick={() => selectError(sel.className)}
              className="flex flex-col items-start gap-0.5 rounded-md bg-[#DC2626]/15 px-2 py-1.5 text-left text-[#FCA5A5] transition-colors hover:bg-[#DC2626]/25"
            >
              <span className="flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                <AlertTriangle className="h-3 w-3" /> Rompió acá
              </span>
              <span className="break-words font-mono text-[10px] leading-snug">
                {sel.error?.type ?? "Excepción"}
                {sel.error?.message ? `: ${sel.error.message}` : ""} — ver stacktrace
              </span>
            </button>
          )}

          {sel.methods.length > 0 && (
            <Detail title="Métodos — click para ver a qué llaman">
              {sel.methods.map((m) => (
                <div key={m} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleMethod(sel.fqcn, m)}
                    className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-left font-mono text-[10px] text-[var(--bordo)] transition-colors hover:bg-[var(--bg-panel)]"
                  >
                    {openMethod === m ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    {m}()
                  </button>
                  {openMethod === m && (
                    <div className="ml-2 flex flex-col gap-0.5 border-l border-[var(--border-silver)] py-0.5 pl-2">
                      {loadingMethod ? (
                        <span className="font-mono text-[9px] text-[var(--silver-dark)]">
                          analizando…
                        </span>
                      ) : methodCalls.length === 0 ? (
                        <span className="font-mono text-[9px] text-[var(--silver-dark)]">
                          sin llamadas a otras clases
                        </span>
                      ) : (
                        methodCalls.map((c, i) => {
                          const isNode = nodes.some(
                            (n) => n.className === c.targetClass,
                          );
                          return (
                            <button
                              key={i}
                              type="button"
                              disabled={!isNode}
                              onClick={() => isNode && setHighlight(c.targetClass)}
                              title={isNode ? "Resaltar en el grafo" : undefined}
                              className={`flex items-center gap-1 text-left font-mono text-[9px] ${
                                isNode
                                  ? "text-[var(--fg-secondary)] hover:text-[var(--bordo)]"
                                  : "cursor-default text-[var(--silver-dark)]"
                              }`}
                            >
                              <span className="shrink-0 rounded-[3px] bg-[var(--bg-input)] px-1 text-[var(--silver-dark)]">
                                L{c.line}
                              </span>
                              <ArrowRight className="h-2.5 w-2.5 shrink-0 text-[var(--bordo)]" />
                              <span className="truncate">
                                {c.targetClass}.{c.method}()
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              ))}
            </Detail>
          )}

          {outgoing.length > 0 && (
            <Detail title="Llama a">
              {outgoing.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setHighlight(e.target)}
                  className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left font-mono text-[10px] text-[var(--fg-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--fg-primary)]"
                >
                  <ArrowRight className="h-3 w-3 shrink-0 text-[var(--bordo)]" />
                  <span className="truncate">
                    {e.target}
                    {e.methods.length > 0 ? ` · ${e.methods.join(", ")}` : ""}
                  </span>
                  {e.count > 1 && (
                    <span className="ml-auto shrink-0 text-[var(--silver-dark)]">
                      ×{e.count}
                    </span>
                  )}
                </button>
              ))}
            </Detail>
          )}

          {incoming.length > 0 && (
            <Detail title="Llamado por">
              {incoming.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setHighlight(e.source)}
                  className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left font-mono text-[10px] text-[var(--fg-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--fg-primary)]"
                >
                  <ArrowRight className="h-3 w-3 shrink-0 rotate-180 text-[var(--silver)]" />
                  <span className="truncate">{e.source}</span>
                </button>
              ))}
            </Detail>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
        {title}
      </span>
      {children}
    </div>
  );
}
