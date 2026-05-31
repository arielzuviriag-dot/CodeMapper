"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Coffee,
  FileDown,
  Globe,
  Layers,
  Loader2,
  Radio,
  RotateCcw,
  Send,
} from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportTracePdf, scanFrontendScreens } from "@/lib/api";
import { ConcentricWaves } from "@/components/listening/ConcentricWaves";
import { ListeningErrorPanel } from "@/components/listening/ListeningErrorPanel";
import { ListeningOrderPanel } from "@/components/listening/ListeningOrderPanel";
import { useListeningStore } from "@/store/listeningStore";
import { useTraceStream } from "@/hooks/useTraceStream";
import type { TraceView } from "@/lib/trace";

/** Node-type tabs for the live graph: show both, only HTTP entries, only Java. */
const VIEW_TABS: { key: TraceView; label: string; Icon: typeof Layers }[] = [
  { key: "all", label: "Todo", Icon: Layers },
  { key: "web", label: "Web", Icon: Globe },
  { key: "java", label: "Java", Icon: Coffee },
];

const ListeningGraph = dynamic(
  () =>
    import("@/components/listening/ListeningGraph").then(
      (m) => m.ListeningGraph,
    ),
  { ssr: false },
);

/**
 * "Escuchando" mode — live execution tracing screen. Four states:
 *   INICIAL    — black screen, calm concentric waves, "Iniciar" button.
 *   ESCUCHANDO — intensified waves, SSE open, waiting for the first span.
 *   DIBUJANDO  — first root span arrived; the graph builds outward in rings.
 *   ERROR      — an errored node turns red and opens the stacktrace panel.
 *
 * Lives on its own route (NOT under /map/[sessionId]) and on its own store so
 * the general / Foco modes are completely untouched.
 */
export default function EscucharPage() {
  const router = useRouter();
  const phase = useListeningStore((s) => s.phase);
  const hasGraph = useListeningStore((s) => s.hasGraph);
  const start = useListeningStore((s) => s.start);
  const stop = useListeningStore((s) => s.stop);
  const clearGraph = useListeningStore((s) => s.clearGraph);
  const setUrlFilter = useListeningStore((s) => s.setUrlFilter);
  const urlFilter = useListeningStore((s) => s.urlFilter);
  const view = useListeningStore((s) => s.view);
  const setView = useListeningStore((s) => s.setView);
  const nodes = useListeningStore((s) => s.nodes);
  const rootClassName = useListeningStore((s) => s.rootClassName);
  const setScreenIndex = useListeningStore((s) => s.setScreenIndex);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const listening = phase === "listening";
  // Open the SSE stream only while listening.
  useTraceStream(listening);

  // The user types a PART of the URL they're going to navigate (e.g. "/checkout"
  // or "localhost:8085"). We DON'T fire any request — the user navigates their
  // app themselves in another tab/browser; whatever they hit matching this
  // filter gets drawn. Empty = listen to everything. `armed` flips once they
  // press "Escuchar" so we switch from the prompt to the live view.
  // Empty by default = "escuchar todo". A hardcoded default URL (e.g. a
  // specific port) silently filters out every trace whose service runs on a
  // different port, which reads as "nothing is arriving". Start wide; the user
  // narrows with the filter box if they need to.
  const [urlInput, setUrlInput] = useState("");
  // Optional front-end path: when set, scan it so the live graph shows which
  // screen (web/mobile) triggered each request.
  const [frontPath, setFrontPath] = useState("");
  const [armed, setArmed] = useState(false);

  // A filesystem path (has a backslash or a "C:\" / "/Users/" shape) is NOT a
  // URL — if the user pastes one in the URL filter, it would match no trace and
  // hide everything. Detect it and treat it as the front path instead.
  const looksLikePath = (s: string) =>
    s.includes("\\") || /^[A-Za-z]:[\\/]/.test(s) || /\/(Users|home|mnt|var)\//i.test(s);

  const escuchar = () => {
    const raw = urlInput.trim();
    let urlFilterVal = raw;
    let fp = frontPath.trim();
    if (raw && looksLikePath(raw) && !fp) {
      // They pasted a project folder into the URL filter — use it to scan the
      // front (detect screens), and DON'T filter URLs by it.
      fp = raw;
      urlFilterVal = "";
      toast.message(
        "Eso parece la ruta del front — la uso para detectar pantallas, no como filtro de URL",
      );
    }
    setUrlFilter(urlFilterVal);
    if (fp) {
      scanFrontendScreens(fp)
        .then((calls) => {
          setScreenIndex(
            calls.map((c) => ({
              verb: c.verb,
              path: c.path,
              screen: c.screenName,
              mobile: c.mobile,
            })),
          );
          toast.success(`Front escaneado — ${calls.length} pantalla(s) detectada(s)`);
        })
        .catch(() => toast.error("No se pudo escanear el front"));
    }
    setArmed(true);
    toast.success(
      urlFilterVal
        ? `Escuchando llamadas de "${urlFilterVal}" — navegá esa URL`
        : "Escuchando todo — navegá tu app",
    );
  };
  const onVolver = () => {
    stop();
    setArmed(false);
    router.push("/");
  };
  const onDetener = () => {
    stop();
    setArmed(false);
  };
  // Borrar lo dibujado pero seguir escuchando: pantalla en negro (las ondas
  // vuelven) y se redibuja apenas pase una nueva llamada. NO cierra el stream.
  const onResetear = () => {
    clearGraph();
    toast.success("Pantalla reseteada — navegá de nuevo y la vuelvo a dibujar");
  };

  // Descargar PDF de lo que se ve: snapshot del grafo + tabla por objeto
  // (orden de ejecución, Web/Java, cuántas veces se llamó). Stateless: el
  // backend solo da formato a lo que mandamos, así el PDF refleja la pantalla.
  const onDownloadPdf = async () => {
    if (downloadingPdf || nodes.length === 0) return;
    setDownloadingPdf(true);
    try {
      let imageBase64: string | null = null;
      const viewport = document.querySelector(
        ".react-flow__viewport",
      ) as HTMLElement | null;
      if (viewport) {
        try {
          imageBase64 = await toPng(viewport, {
            backgroundColor: "#0A0A0A",
            pixelRatio: 2,
          });
        } catch {
          // El snapshot es opcional — si falla, el PDF lleva solo la tabla.
        }
      }
      const blob = await exportTracePdf({
        view,
        urlFilter,
        rootClassName,
        imageBase64,
        nodes: nodes.map((n) => ({
          className: n.className,
          fqcn: n.fqcn,
          http: n.isHttp,
          hitCount: n.hitCount,
          order: n.order,
          depth: n.depth,
          methods: n.methods,
          status: n.status,
        })),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "codemapper-escuchando.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch (err) {
      console.error("[CodeMapper] Trace PDF export failed", err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Top chrome — Volver + state pill. Floats above everything. */}
      <header className="absolute left-0 right-0 top-0 z-30 flex h-[56px] items-center justify-between px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onVolver}
          className="text-[var(--silver)] hover:bg-[var(--bg-panel)] hover:text-[var(--bordo)]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          <span className="text-xs uppercase tracking-[0.14em]">Volver</span>
        </Button>

        {listening && armed && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-sm border border-[var(--bordo)] bg-[var(--bordo)]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--bordo)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--bordo)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--bordo)]" />
              </span>
              Escuchando{urlFilter ? `: ${urlFilter}` : " todo"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onDetener}
              className="border-[var(--border-silver)] bg-transparent text-xs uppercase tracking-[0.14em] hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
            >
              Detener
            </Button>
          </div>
        )}
      </header>

      {/* View tabs — Todo / Web / Java. Filter the live graph by node type:
          only the HTTP request entries, only the Java classes, or both. Shown
          once there's a graph to filter. */}
      {listening && armed && hasGraph && (
        <div className="absolute left-1/2 top-[64px] z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)]/95 p-1 shadow-[var(--shadow-lg)] backdrop-blur">
          {VIEW_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                view === key
                  ? "bg-[var(--bordo)] text-white"
                  : "text-[var(--silver)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* DIBUJANDO — the live graph. Mounted once a graph exists; the waves
          stay underneath until then, so the transition reads as "waves become
          the structure". */}
      {listening && hasGraph && (
        <div className="absolute inset-0 z-10">
          <ListeningGraph />
        </div>
      )}

      {/* Left order panel — call sequence + per-object detail (see-through). */}
      {listening && hasGraph && <ListeningOrderPanel />}

      {/* INICIAL / ESCUCHANDO — waves + (resting) the Iniciar button. Hidden
          once the graph takes over. */}
      {!(listening && hasGraph) && (
        <div className="absolute inset-0 z-0">
          <ConcentricWaves intensified={listening && armed} />
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
            {!listening ? (
              <button
                type="button"
                onClick={start}
                className="group flex h-32 w-32 flex-col items-center justify-center gap-1.5 rounded-full border-2 border-[var(--bordo)] bg-[var(--bg-card)] text-[var(--bordo)] shadow-[0_0_30px_rgba(185,28,66,0.5)] transition-all hover:scale-105 hover:bg-[var(--bordo)] hover:text-white hover:shadow-[0_0_48px_rgba(185,28,66,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bordo)]/60"
              >
                <Radio className="h-7 w-7" strokeWidth={2} />
                <span className="font-mono text-xs uppercase tracking-[0.2em]">
                  Iniciar
                </span>
              </button>
            ) : !armed ? (
              <div className="pointer-events-auto flex flex-col items-center gap-4">
                <span className="font-mono text-sm uppercase tracking-[0.22em] text-[var(--silver)]">
                  ¿Qué servicio querés escuchar?
                </span>
                <div className="flex w-[min(520px,86vw)] items-center gap-2 rounded-lg border border-[var(--bordo)]/60 bg-[var(--bg-card)]/95 p-1.5 shadow-[0_0_24px_rgba(185,28,66,0.25)]">
                  <input
                    type="text"
                    autoFocus
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") escuchar();
                    }}
                    placeholder="ej: localhost:5180   (vacío = escuchar todo)"
                    className="flex-1 bg-transparent px-2 font-mono text-sm text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:outline-none"
                  />
                  <Button
                    onClick={escuchar}
                    className="shrink-0 gap-1.5 bg-[var(--bordo)] text-xs uppercase tracking-[0.14em] text-white hover:bg-[var(--bordo-mid)]"
                  >
                    <Send className="h-4 w-4" />
                    Escuchar
                  </Button>
                </div>
                {/* Optional: front-end path so the graph shows which screen
                    (web 🌐 / mobile 📱) triggered each request. */}
                <div className="flex w-[min(520px,86vw)] items-center gap-2 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)]/80 p-1.5">
                  <input
                    type="text"
                    value={frontPath}
                    onChange={(e) => setFrontPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") escuchar();
                    }}
                    placeholder="ruta del front (opcional) — ej: C:\Users\ariel\Plixe\plixe-mobile"
                    className="flex-1 bg-transparent px-2 font-mono text-xs text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:outline-none"
                  />
                </div>
                <span className="max-w-md text-center font-mono text-[11px] leading-relaxed text-[var(--silver-dark)]">
                  Poné la URL del servicio (o una parte). Después navegá esa app
                  en otra solapa — voy dibujando el recorrido a medida que pasa.
                  (El servicio tiene que correr con el agente OpenTelemetry.) Si
                  agregás la ruta del front, te muestro qué pantalla disparó cada
                  llamada.
                </span>
              </div>
            ) : (
              <div className="pointer-events-auto flex flex-col items-center gap-3">
                <span className="font-mono text-sm uppercase tracking-[0.22em] text-[var(--silver)]">
                  Escuchando{urlFilter ? `: ${urlFilter}` : " todo"}…
                </span>
                <span className="max-w-md text-center font-mono text-[11px] leading-relaxed text-[var(--silver-dark)]">
                  Andá a otra solapa/navegador y navegá tu app. Apenas pase una
                  llamada{urlFilter ? ` a "${urlFilter}"` : ""}, la dibujo acá en
                  orden.
                </span>
                <button
                  type="button"
                  onClick={() => setArmed(false)}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--silver-dark)] underline-offset-2 hover:text-[var(--bordo)] hover:underline"
                >
                  Cambiar URL
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* While drawing, a compact bar lets the user change the URL filter —
          re-scopes the map to traces of the new URL (no request is fired; the
          user keeps navigating their app). */}
      {listening && armed && hasGraph && (
        <div className="absolute bottom-5 left-1/2 z-30 flex w-[min(680px,94vw)] -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)]/95 p-1.5 shadow-[var(--shadow-lg)] backdrop-blur">
          <span className="pl-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
            Filtro URL
          </span>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") escuchar();
            }}
            placeholder="ej: /checkout  (vacío = todo)"
            className="flex-1 bg-transparent px-1 font-mono text-xs text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:outline-none"
          />
          <Button
            size="sm"
            onClick={escuchar}
            className="shrink-0 gap-1.5 bg-[var(--bordo)] text-xs uppercase tracking-[0.14em] text-white hover:bg-[var(--bordo-mid)]"
          >
            <Send className="h-3.5 w-3.5" />
            Aplicar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onResetear}
            title="Borra el mapa y deja la pantalla en negro, pero sigue escuchando"
            className="shrink-0 gap-1.5 border-[var(--border-silver)] bg-transparent text-xs uppercase tracking-[0.14em] hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Resetear
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDownloadPdf}
            disabled={downloadingPdf}
            title="Descarga un PDF con lo que se ve: cada objeto, si es Web o Java, cuántas veces se llamó y en qué orden"
            className="shrink-0 gap-1.5 border-[var(--border-silver)] bg-transparent text-xs uppercase tracking-[0.14em] hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
          >
            {downloadingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            PDF
          </Button>
        </div>
      )}

      {/* ERROR — stacktrace panel (opens on red-node click). */}
      <ListeningErrorPanel />
    </main>
  );
}
