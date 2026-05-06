"use client";

import * as React from "react";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
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

  const showLoadingScreen =
    nodeCount === 0 &&
    (sessionStatus === "idle" || sessionStatus === "streaming");

  useEffect(() => {
    resolveDemoMode();
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
        <header className="cm-hairline-top relative flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--border-silver)] bg-[var(--bg-card)] px-4">
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
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold text-[var(--fg-primary)]">
                {stats.projectName || "Proyecto"}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
                <span className="tabular-nums text-[var(--silver)]">{nodeCount}</span> clases ·{" "}
                <span className="tabular-nums text-[var(--silver)]">{edgeCount}</span> conexiones
              </span>
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
