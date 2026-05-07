"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Crosshair,
  Download,
  FileText,
  Info,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisLoadingScreen } from "@/components/loading/AnalysisLoadingScreen";
import { InlineGraphLoading } from "@/components/loading/InlineGraphLoading";
import { StreamingIndicator } from "@/components/loading/StreamingIndicator";
import { FilterPanel } from "@/components/graph/FilterPanel";
import { ProjectStats } from "@/components/sidebar/ProjectStats";
import { ParseProgress } from "@/components/sidebar/ParseProgress";
import { ClassDetailSheet } from "@/components/sidebar/ClassDetailSheet";
import { exportFocoPdf, resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import { useSSE } from "@/hooks/useSSE";

const CodeGraph = dynamic(
  () => import("@/components/graph/CodeGraph").then((m) => m.CodeGraph),
  { ssr: false, loading: () => <GraphSkeleton /> },
);

const FocusGraph = dynamic(
  () => import("@/components/graph/FocusGraph").then((m) => m.FocusGraph),
  { ssr: false, loading: () => <GraphSkeleton /> },
);

const FocusMethodGraph = dynamic(
  () =>
    import("@/components/graph/FocusMethodGraph").then(
      (m) => m.FocusMethodGraph,
    ),
  { ssr: false, loading: () => <GraphSkeleton /> },
);

export default function MapPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = params.sessionId;
  const urlMode = searchParams.get("mode");

  const setSessionId = useGraphStore((s) => s.setSessionId);
  const reset = useGraphStore((s) => s.reset);
  const setFocusMode = useGraphStore((s) => s.setFocusMode);
  const setFocusMethodMode = useGraphStore((s) => s.setFocusMethodMode);
  const stats = useGraphStore((s) => s.stats);
  const nodeCount = useGraphStore((s) => s.nodes.size);
  const edgeCount = useGraphStore((s) => s.edges.length);
  const sessionStatus = useGraphStore((s) => s.sessionStatus);
  const limitReached = useGraphStore((s) => s.limitReached);
  const focusMode = useGraphStore((s) => s.focusMode);
  const focusClass = useGraphStore((s) => s.focusClass);
  const focusMethodMode = useGraphStore((s) => s.focusMethodMode);
  const focusMethod = useGraphStore((s) => s.focusMethod);
  const focusConnections = useGraphStore((s) => s.focusConnections);
  const focusConnectionCount = focusConnections.length;
  const pendingReanalysis = useGraphStore((s) => s.pendingReanalysis);
  const setPendingReanalysis = useGraphStore((s) => s.setPendingReanalysis);

  const [isPro, setIsPro] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  /** Auto-dismiss the FREE limit banner after 5s — long enough to read,
   *  short enough to not steal real estate from the graph. */
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const inAnyFocusMode = focusMode || focusMethodMode;
  const showFullLimitBanner =
    !isPro && !inAnyFocusMode && limitReached.reached && !bannerDismissed;

  useEffect(() => {
    setIsPro(resolveDemoMode() === "pro");
    setIsInitialLoading(true);
    reset();
    setSessionId(sessionId);
    if (urlMode === "focus") {
      setFocusMode(true);
    } else if (urlMode === "focus-method") {
      setFocusMethodMode(true);
    }
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (focusClass !== null || focusMethod !== null || nodeCount > 0) {
      setIsInitialLoading(false);
      // First useful event arrived → the chained re-analysis (if any) is no
      // longer "pending". This single one-way flip dismisses InlineGraphLoading.
      setPendingReanalysis(false);
    }
  }, [focusClass, focusMethod, nodeCount, setPendingReanalysis]);

  // Auto-hide the FREE limit banner 5s after it appears. Resets on a fresh
  // session (when reached flips back to false via reset()) so the next
  // analysis can show its own banner.
  useEffect(() => {
    if (!limitReached.reached) {
      setBannerDismissed(false);
      return;
    }
    setBannerDismissed(false);
    const t = setTimeout(() => setBannerDismissed(true), 5000);
    return () => clearTimeout(t);
  }, [limitReached.reached]);

  useSSE(sessionId);

  const onExport = async () => {
    const viewport = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!viewport) return;
    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: "#0A0A0A",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `codemapper-${sessionId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
    }
  };

  const onDownloadPdf = async () => {
    if (!focusClass || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const blob = await exportFocoPdf({
        focusClass,
        connections: focusConnections,
        pro: isPro,
        limitApplied: limitReached.reached,
        totalAvailable:
          limitReached.totalAvailable > 0
            ? limitReached.totalAvailable
            : focusConnections.length,
      });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const safeName = focusClass.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const link = document.createElement("a");
      link.href = url;
      link.download = `codemapper-foco-${safeName}-${today}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[CodeMapper] PDF export failed", err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const canDownloadPdf = focusMode && !focusMethodMode && focusClass !== null;

  const headerProjectLabel = focusMethodMode
    ? focusMethod
      ? `${focusMethod.containingClass}.${focusMethod.methodName}()`
      : stats.projectName ?? "Foco método"
    : focusMode
      ? focusClass?.name ?? stats.projectName ?? "Foco"
      : stats.projectName || "Proyecto";

  const onUpgradeBannerClick = () => {
    toast.success("Te avisaremos cuando salga PRO");
  };

  return (
    <ErrorBoundary>
      <main className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)]">
        <header className="cm-hairline-top relative flex h-[64px] shrink-0 items-center justify-between border-b border-[var(--border-silver)] bg-[var(--bg-card)] px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="text-[var(--silver)] hover:bg-[var(--bg-panel)] hover:text-[var(--bordo)]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="text-xs uppercase tracking-[0.14em]">Volver</span>
          </Button>

          <div className="flex items-center gap-3">
            {inAnyFocusMode ? (
              <Crosshair
                className="h-4 w-4 text-[var(--bordo)]"
                strokeWidth={2}
                style={{ filter: "drop-shadow(0 0 6px rgba(185,28,66,0.6))" }}
              />
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--bordo)] shadow-[0_0_8px_rgba(185,28,66,0.6)]" />
            )}
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-2">
                {focusMethodMode ? (
                  <FocusMethodBadge />
                ) : focusMode ? (
                  <FocusModeBadge />
                ) : null}
                <span className="text-sm font-semibold text-[var(--fg-primary)]">
                  {headerProjectLabel}
                </span>
                {!isPro && <FreeBadge />}
              </div>
              <HeaderStats
                focusMode={focusMode}
                focusMethodMode={focusMethodMode}
                nodeCount={nodeCount}
                edgeCount={edgeCount}
                focusConnections={focusConnectionCount}
                limitReached={limitReached.reached}
                totalAvailable={limitReached.totalAvailable}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canDownloadPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDownloadPdf}
                disabled={isExportingPdf}
                className="border-[var(--border-silver)] bg-transparent text-xs uppercase tracking-[0.14em] hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)] disabled:opacity-60"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Descargar PDF
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="border-[var(--border-silver)] bg-transparent text-xs uppercase tracking-[0.14em] hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar PNG
            </Button>
          </div>
        </header>

        <AnimatePresence>
          {showFullLimitBanner && (
            <LimitReachedBanner
              parsed={limitReached.parsed}
              totalAvailable={limitReached.totalAvailable}
              onUpgrade={onUpgradeBannerClick}
            />
          )}
        </AnimatePresence>

        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-[var(--border-silver)] bg-[var(--bg-base)] p-3 lg:flex">
            <ParseProgress />
            {focusMethodMode ? (
              <FocusMethodSidebarInfo />
            ) : focusMode ? (
              <>
                <FocusSidebarInfo />
                <FocusFieldsBlock />
                <FocusMethodsBlock />
              </>
            ) : (
              <>
                <ProjectStats />
                <FilterPanel />
              </>
            )}
            {!inAnyFocusMode && <EmptyOrLoading />}
          </aside>

          <section className="relative flex-1">
            {pendingReanalysis ? null : focusMethodMode ? (
              <FocusMethodGraph />
            ) : focusMode ? (
              <FocusGraph />
            ) : (
              <CodeGraph />
            )}
            <AnimatePresence>
              {pendingReanalysis && <InlineGraphLoading />}
            </AnimatePresence>
            <AnimatePresence>
              {sessionStatus === "streaming" &&
                (inAnyFocusMode
                  ? focusConnectionCount > 0 ||
                    focusClass !== null ||
                    focusMethod !== null
                  : nodeCount > 0) && (
                  <div className="absolute bottom-4 left-4 z-20 w-[240px]">
                    <StreamingIndicator />
                  </div>
                )}
            </AnimatePresence>
          </section>
        </div>

        <ClassDetailSheet />

        {/* Full-screen loader is for the FIRST analysis (home → /map). For
            chained re-analyses (sheet → /map/{newId}) we use the inline
            loader inside the graph section, so the header + sidebar stay
            visible. The two are mutually exclusive. */}
        <AnimatePresence initial={false}>
          {isInitialLoading && !pendingReanalysis && <AnalysisLoadingScreen />}
        </AnimatePresence>
      </main>
    </ErrorBoundary>
  );
}

function FocusModeBadge() {
  return (
    <span className="rounded-sm border border-[var(--bordo)] bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
      Foco
    </span>
  );
}

function FocusMethodBadge() {
  return (
    <span className="rounded-sm border border-[var(--bordo)] bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
      Foco método
    </span>
  );
}

function FreeBadge() {
  return (
    <span className="rounded-sm bg-[var(--bordo)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_8px_rgba(185,28,66,0.4)]">
      Free
    </span>
  );
}

function HeaderStats({
  focusMode,
  focusMethodMode,
  nodeCount,
  edgeCount,
  focusConnections,
  limitReached,
  totalAvailable,
}: {
  focusMode: boolean;
  focusMethodMode: boolean;
  nodeCount: number;
  edgeCount: number;
  focusConnections: number;
  limitReached: boolean;
  totalAvailable: number;
}) {
  const baseCls =
    "font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]";

  if (focusMethodMode) {
    return (
      <span className={baseCls}>
        Invocadores ·{" "}
        <span className="tabular-nums text-[var(--silver)]">
          {focusConnections}
        </span>{" "}
        clases
      </span>
    );
  }

  if (focusMode) {
    return (
      <span className={baseCls}>
        Nivel 1 ·{" "}
        <span className="tabular-nums text-[var(--silver)]">
          {focusConnections}
        </span>{" "}
        conexiones directas
      </span>
    );
  }

  if (limitReached) {
    return (
      <span className={baseCls}>
        Mostrando{" "}
        <span className="tabular-nums text-[var(--bordo)]">{nodeCount}</span>{" "}
        <span className="text-[var(--bordo)]">de</span>{" "}
        <span className="tabular-nums text-[var(--bordo)]">{totalAvailable}</span>{" "}
        clases ·{" "}
        <span className="tabular-nums text-[var(--silver)]">{edgeCount}</span>{" "}
        conexiones
      </span>
    );
  }

  return (
    <span className={baseCls}>
      <span className="tabular-nums text-[var(--silver)]">{nodeCount}</span>{" "}
      clases ·{" "}
      <span className="tabular-nums text-[var(--silver)]">{edgeCount}</span>{" "}
      conexiones
    </span>
  );
}

function LimitReachedBanner({
  parsed,
  totalAvailable,
  onUpgrade,
}: {
  parsed: number;
  totalAvailable: number;
  onUpgrade: () => void;
}) {
  const remaining = Math.max(totalAvailable - parsed, 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{
        opacity: 0,
        y: -8,
        height: 0,
        transition: { duration: 0.3 },
      }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden border-y border-[var(--bordo)]/40"
      style={{ background: "rgba(185,28,66,0.08)" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-3 text-xs text-[var(--fg-secondary)]">
          <Info className="h-4 w-4 shrink-0 text-[var(--bordo)]" />
          <span className="font-mono">
            <span className="font-semibold uppercase tracking-[0.16em] text-[var(--bordo)]">
              Versión Free
            </span>{" "}
            <span className="text-[var(--silver-dark)]">—</span>{" "}
            <span className="text-[var(--fg-primary)]">
              Llegaste al límite ({parsed} / {totalAvailable} archivos).
            </span>{" "}
            <span className="text-[var(--silver-mid)]">
              Hay {remaining} más en este proyecto.
            </span>
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onUpgrade}
          className="shrink-0 border-[var(--bordo)] bg-transparent text-xs uppercase tracking-[0.14em] text-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)] hover:shadow-[0_0_18px_rgba(185,28,66,0.35)]"
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          Quiero ver completo con PRO
        </Button>
      </div>
    </motion.div>
  );
}

function FocusMethodSidebarInfo() {
  const focusMethod = useGraphStore((s) => s.focusMethod);
  const connectionCount = useGraphStore((s) => s.focusConnections.length);

  if (!focusMethod) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-4 text-center text-xs text-[var(--fg-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--bordo)]" />
        Cargando método focus...
      </div>
    );
  }

  return (
    <div className="cm-hairline-top flex flex-col gap-3 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center gap-2">
        <Crosshair
          className="h-3.5 w-3.5 shrink-0 text-[var(--bordo)]"
          style={{ filter: "drop-shadow(0 0 4px rgba(185,28,66,0.55))" }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--silver-dark)]">
          Método foco
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="break-words text-sm font-semibold text-[var(--fg-primary)]">
          {focusMethod.containingClass}.{focusMethod.methodName}()
        </span>
        <span className="break-all font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          {focusMethod.containingClassPackage || "(sin paquete)"}
        </span>
      </div>
      <div className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-2 py-1.5 font-mono text-[10px] leading-snug text-[var(--silver)]">
        <span className="text-[var(--silver-dark)]">retorna:</span>{" "}
        <span className="text-[var(--bordo)]">{focusMethod.returnType}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border-silver)] pt-3 text-center">
        <SidebarMetric value={focusMethod.parameters.length} label="Params" />
        <SidebarMetric value={connectionCount} label="Invocadores" />
      </div>
    </div>
  );
}

function FocusSidebarInfo() {
  const focusClass = useGraphStore((s) => s.focusClass);
  const connectionCount = useGraphStore((s) => s.focusConnections.length);

  if (!focusClass) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-4 text-center text-xs text-[var(--fg-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--bordo)]" />
        Cargando archivo focus...
      </div>
    );
  }

  return (
    <div className="cm-hairline-top flex flex-col gap-3 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center gap-2">
        <Crosshair
          className="h-3.5 w-3.5 shrink-0 text-[var(--bordo)]"
          style={{ filter: "drop-shadow(0 0 4px rgba(185,28,66,0.55))" }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--silver-dark)]">
          Archivo Foco
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="break-words text-sm font-semibold text-[var(--fg-primary)]">
          {focusClass.name}
        </span>
        <span className="break-all font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          {focusClass.packageName || "(sin paquete)"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-[var(--border-silver)] pt-3 text-center">
        <SidebarMetric value={focusClass.fields.length} label="Campos" />
        <SidebarMetric value={focusClass.methods.length} label="Métodos" />
        <SidebarMetric value={connectionCount} label="Conexiones" />
      </div>
    </div>
  );
}

function FocusFieldsBlock() {
  const focusClass = useGraphStore((s) => s.focusClass);
  const openVariableSheet = useGraphStore((s) => s.openVariableSheet);
  const [query, setQuery] = useState("");
  const isFirstMount = useRef(true);

  // After the very first paint of this block, subsequent re-mounts (caused
  // by clearing the filter) shouldn't replay the long initial stagger.
  useEffect(() => {
    const t = setTimeout(() => {
      isFirstMount.current = false;
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const trimmed = query.trim();
  const isFiltering = trimmed.length >= 3;
  const lower = trimmed.toLowerCase();
  const allFields = focusClass?.fields ?? [];
  const filtered = useMemo(
    () =>
      isFiltering
        ? allFields.filter((f) => f.name.toLowerCase().includes(lower))
        : allFields,
    [allFields, isFiltering, lower],
  );

  if (!focusClass || allFields.length === 0) return null;

  const total = allFields.length;
  const matched = filtered.length;
  const empty = isFiltering && matched === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="cm-hairline-top flex flex-col gap-2 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] p-3"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--silver-dark)]">
        Variables{" "}
        <span className="text-[var(--silver)] tabular-nums">
          ({isFiltering ? `${matched} de ${total}` : total})
        </span>
      </div>

      <SidebarSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar variable..."
        ariaLabel="Buscar variable"
      />

      {empty ? (
        <div className="py-2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
          Sin resultados
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {filtered.map((f, i) => (
              <motion.button
                key={f.name}
                type="button"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6, transition: { duration: 0.15 } }}
                transition={{
                  duration: 0.28,
                  delay: isFirstMount.current ? i * 0.2 : 0,
                }}
                onClick={() => openVariableSheet(focusClass.id, f)}
                className="flex items-baseline gap-2 rounded-sm px-1 py-0.5 text-left font-mono text-[11px] leading-tight transition-colors hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
              >
                <span className="shrink-0 text-[var(--silver-dark)]">
                  {f.type}
                </span>
                <span className="truncate text-[var(--fg-primary)]">
                  {f.name}
                </span>
                {f.annotations.length > 0 && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bordo)]" />
                )}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function FocusMethodsBlock() {
  const focusClass = useGraphStore((s) => s.focusClass);
  const openMethodSheet = useGraphStore((s) => s.openMethodSheet);
  const [query, setQuery] = useState("");
  const isFirstMount = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => {
      isFirstMount.current = false;
    }, 50);
    return () => clearTimeout(t);
  }, []);

  // Methods come AFTER fields visually — start delay accounts for the
  // fields stagger (each field at 0.2s, plus the block animation).
  const fieldsDelay = (focusClass?.fields.length ?? 0) * 0.2 + 0.2;

  const trimmed = query.trim();
  const isFiltering = trimmed.length >= 3;
  const lower = trimmed.toLowerCase();
  const allMethods = focusClass?.methods ?? [];
  const filtered = useMemo(
    () =>
      isFiltering
        ? allMethods.filter((m) => m.name.toLowerCase().includes(lower))
        : allMethods,
    [allMethods, isFiltering, lower],
  );

  if (!focusClass || allMethods.length === 0) return null;

  const total = allMethods.length;
  const matched = filtered.length;
  const empty = isFiltering && matched === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: fieldsDelay }}
      className="cm-hairline-top flex flex-col gap-2 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] p-3"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--silver-dark)]">
        Métodos{" "}
        <span className="text-[var(--silver)] tabular-nums">
          ({isFiltering ? `${matched} de ${total}` : total})
        </span>
      </div>

      <SidebarSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar método..."
        ariaLabel="Buscar método"
      />

      {empty ? (
        <div className="py-2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
          Sin resultados
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {filtered.map((m, i) => (
              <motion.button
                key={m.name}
                type="button"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6, transition: { duration: 0.15 } }}
                transition={{
                  duration: 0.22,
                  delay: isFirstMount.current ? fieldsDelay + i * 0.1 : 0,
                }}
                onClick={() => openMethodSheet(focusClass.id, m)}
                className="flex items-baseline gap-1 rounded-sm px-1 py-0.5 text-left font-mono text-[11px] leading-tight transition-colors hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
              >
                <span className="truncate text-[var(--fg-primary)]">
                  {m.name}
                </span>
                <span className="text-[var(--fg-muted)]">()</span>
                {m.returnType !== "<constructor>" && (
                  <span className="truncate text-[var(--silver-dark)]">
                    : {m.returnType}
                  </span>
                )}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function SidebarSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative flex items-center gap-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-2.5 py-1.5 transition-all focus-within:border-[var(--bordo)] focus-within:shadow-[0_0_12px_rgba(185,28,66,0.22)]">
      <Search className="h-3 w-3 shrink-0 text-[var(--silver-mid)]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="flex-1 bg-transparent font-mono text-xs leading-tight text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:outline-none"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="rounded-sm text-[var(--silver-dark)] transition-colors hover:text-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SidebarMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-xl font-semibold tabular-nums leading-none text-[var(--fg-primary)]">
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
        {label}
      </span>
    </div>
  );
}

function EmptyOrLoading() {
  const status = useGraphStore((s) => s.sessionStatus);
  const nodeCount = useGraphStore((s) => s.nodes.size);
  if (nodeCount > 0) return null;
  if (status === "streaming" || status === "idle") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-4 text-center text-xs text-[var(--fg-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--bordo)]" />
        Esperando primeras clases...
      </div>
    );
  }
  if (status === "complete") {
    return (
      <div className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-4 text-center text-xs text-[var(--fg-secondary)]">
        No se encontraron clases en el proyecto.
      </div>
    );
  }
  return null;
}

function GraphSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--bg-base)]">
      <Skeleton className="h-3/4 w-3/4 rounded-md bg-[var(--bg-card)]" />
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }
  componentDidCatch(err: Error) {
    console.error("[CodeMapper] error", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[var(--bg-base)] p-6 text-center">
          <h2 className="text-lg font-semibold text-[var(--bordo)]">
            Algo salió mal
          </h2>
          <p className="text-sm text-[var(--fg-secondary)]">
            {this.state.message}
          </p>
          <Button
            onClick={() => window.location.assign("/")}
            className="bg-[var(--bordo)] uppercase tracking-[0.14em] hover:bg-[var(--bordo-mid)]"
          >
            Volver al inicio
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
