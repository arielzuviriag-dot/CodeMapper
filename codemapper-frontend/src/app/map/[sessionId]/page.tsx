"use client";

import * as React from "react";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectStats } from "@/components/sidebar/ProjectStats";
import { ParseProgress } from "@/components/sidebar/ParseProgress";
import { ClassDetailSheet } from "@/components/sidebar/ClassDetailSheet";
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

  useEffect(() => {
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
        backgroundColor: "#0a0a0a",
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
      <main className="flex h-screen flex-col overflow-hidden bg-background">
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-card/40 px-4 backdrop-blur-sm">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <div className="flex flex-col items-center">
            <span className="text-sm font-semibold">
              {stats.projectName || "Proyecto"}
            </span>
            <span className="text-xs text-muted-foreground">
              {nodeCount} clases · {edgeCount} conexiones
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="mr-2 h-4 w-4" />
            Exportar PNG
          </Button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-[280px] shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-3 lg:flex">
            <ParseProgress />
            <ProjectStats />
            <EmptyOrLoading />
          </aside>

          <section className="relative flex-1">
            <CodeGraph />
          </section>
        </div>

        <ClassDetailSheet />
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
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Esperando primeras clases...
      </div>
    );
  }
  if (status === "complete") {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
        No se encontraron clases en el proyecto.
      </div>
    );
  }
  return null;
}

function GraphSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Skeleton className="h-3/4 w-3/4 rounded-2xl" />
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
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
          <h2 className="text-lg font-semibold text-destructive">
            Algo salió mal
          </h2>
          <p className="text-sm text-muted-foreground">{this.state.message}</p>
          <Button onClick={() => window.location.assign("/")}>Volver al inicio</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
