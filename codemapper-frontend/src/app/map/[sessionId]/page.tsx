"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Download, Info, Loader2, Sparkles } from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisLoadingScreen } from "@/components/loading/AnalysisLoadingScreen";
import { StreamingIndicator } from "@/components/loading/StreamingIndicator";
import { ProjectStats } from "@/components/sidebar/ProjectStats";
import { ParseProgress } from "@/components/sidebar/ParseProgress";
import { ClassDetailSheet } from "@/components/sidebar/ClassDetailSheet";
import { LimitReachedModal } from "@/components/sidebar/LimitReachedModal";
import { resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import { useSSE } from "@/hooks/useSSE";

const CodeGraph = dynamic(
  () => import("@/components/graph/CodeGraph").then((m) => m.CodeGraph),
  { ssr: false, loading: () => <GraphSkeleton /> },
);

export default function MapPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId;

  const setSessionId = useGraphStore((s) => s.setSessionId);
  const reset = useGraphStore((s) => s.reset);
  const stats = useGraphStore((s) => s.stats);
  const nodeCount = useGraphStore((s) => s.nodes.size);
  const edgeCount = useGraphStore((s) => s.edges.length);
  const sessionStatus = useGraphStore((s) => s.sessionStatus);
  const limitReached = useGraphStore((s) => s.limitReached);
  const openLimitReachedModal = useGraphStore((s) => s.openLimitReachedModal);

  const [isPro, setIsPro] = useState(false);

  const showLoadingScreen =
    nodeCount === 0 &&
    (sessionStatus === "idle" || sessionStatus === "streaming");

  const showLimitBanner = !isPro && limitReached.reached;

  useEffect(() => {
    setIsPro(resolveDemoMode() === "pro");
    reset();
    setSessionId(sessionId);
    return () => reset();
  }, [sessionId, reset, setSessionId]);

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

  return (
    <ErrorBoundary>
      <main className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)]">
        {/* ============================================================
            Header — sober black bar, silver hairline bottom border,
            bordó "live" indicator, monospaced metrics.
            ============================================================ */}
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
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--bordo)] shadow-[0_0_8px_rgba(185,28,66,0.6)]" />
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--fg-primary)]">
                  {stats.projectName || "Proyecto"}
                </span>
                {!isPro && <FreeBadge />}
              </div>
              <HeaderStats
                nodeCount={nodeCount}
                edgeCount={edgeCount}
                limitReached={limitReached.reached}
                totalAvailable={limitReached.totalAvailable}
              />
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="border-[var(--border-silver)] bg-transparent text-xs uppercase tracking-[0.14em] hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar PNG
          </Button>
        </header>

        <AnimatePresence>
          {showLimitBanner && (
            <LimitReachedBanner
              parsed={limitReached.parsed}
              totalAvailable={limitReached.totalAvailable}
              onUpgrade={openLimitReachedModal}
            />
          )}
        </AnimatePresence>

        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-[280px] shrink-0 flex-col gap-3 border-r border-[var(--border-silver)] bg-[var(--bg-base)] p-3 lg:flex">
            <ParseProgress />
            <ProjectStats />
            <AnimatePresence>
              {sessionStatus === "streaming" && nodeCount > 0 && (
                <StreamingIndicator />
              )}
            </AnimatePresence>
            <EmptyOrLoading />
          </aside>

          <section className="relative flex-1">
            <CodeGraph />
          </section>
        </div>

        <ClassDetailSheet />
        <LimitReachedModal />

        <AnimatePresence>
          {showLoadingScreen && <AnalysisLoadingScreen />}
        </AnimatePresence>
      </main>
    </ErrorBoundary>
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
  nodeCount,
  edgeCount,
  limitReached,
  totalAvailable,
}: {
  nodeCount: number;
  edgeCount: number;
  limitReached: boolean;
  totalAvailable: number;
}) {
  const baseCls = "font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]";

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
      className="overflow-hidden border-y border-[var(--bordo)]/40 bg-[var(--bordo)]/8"
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
