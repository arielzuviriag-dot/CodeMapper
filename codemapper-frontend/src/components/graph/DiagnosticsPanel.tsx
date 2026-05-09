"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileX,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { exportDiagnosticsPdf } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import type { Diagnostic } from "@/store/graphStore";

const POPOVER_ID = "diagnostics-panel";

/**
 * F-deep — collapsible panel surfacing what deep-body analysis couldn't
 * confirm. Three buckets:
 *  • UNRESOLVED   — parser failed on an expression that may be a project ref
 *  • FALSE_NEG    — focus simple-name appears but symbol didn't link
 *  • UNPARSEABLE  — file couldn't be parsed at all
 *
 * Sits at the bottom of the canvas, off-center to keep the MiniMap (right)
 * and StreamingIndicator (left) clear. Streams in real time as the backend
 * reports findings during pass 2.
 */
export function DiagnosticsPanel() {
  const diagnostics = useGraphStore((s) => s.diagnostics);
  const focusClass = useGraphStore((s) => s.focusClass);
  const detectedJavaVersion = useGraphStore((s) => s.detectedJavaVersion);
  const projectName = useGraphStore((s) => s.stats.projectName);
  const isPro = useGraphStore((s) => s.isPro);
  const openHelpPopover = useGraphStore((s) => s.openHelpPopover);
  const setOpenHelpPopover = useGraphStore((s) => s.setOpenHelpPopover);
  const open = openHelpPopover === POPOVER_ID;
  const [downloading, setDownloading] = useState(false);

  const grouped = useMemo(() => {
    const unresolved: Diagnostic[] = [];
    const falseNeg: Diagnostic[] = [];
    const unparseable: Diagnostic[] = [];
    for (const d of diagnostics) {
      if (d.kind === "UNRESOLVED") unresolved.push(d);
      else if (d.kind === "FALSE_NEGATIVE") falseNeg.push(d);
      else if (d.kind === "UNPARSEABLE") unparseable.push(d);
    }
    return { unresolved, falseNeg, unparseable };
  }, [diagnostics]);

  // Hide the panel entirely while there are zero findings — silence over
  // noise. As soon as the backend emits the first one, it appears.
  if (diagnostics.length === 0) return null;

  const total = diagnostics.length;

  const onDownloadPdf = async () => {
    if (!focusClass || downloading) return;
    setDownloading(true);
    try {
      const blob = await exportDiagnosticsPdf({
        focusName: focusClass.name,
        focusFqn: focusClass.fullyQualifiedName ?? null,
        projectName: projectName ?? null,
        javaVersion: detectedJavaVersion ?? null,
        pro: isPro,
        diagnostics,
      });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const safeName = focusClass.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const tier = isPro ? "PRO" : "FREE";
      const link = document.createElement("a");
      link.href = url;
      link.download = `codemapper-diagnostico-${safeName}-${tier}-${today}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[CodeMapper] diagnostics PDF export failed", err);
      toast.error("No se pudo generar el PDF de diagnóstico");
    } finally {
      setDownloading(false);
    }
  };

  return (
    // Bottom-center-right of the canvas. Wide enough to read snippets without
    // scrolling, tall enough to show several findings. Stays clear of the
    // MiniMap (bottom-right) and the StreamingIndicator (bottom-left).
    <div className="pointer-events-auto absolute bottom-4 right-[260px] z-20 flex w-[520px] max-w-[calc(100vw-32px)] flex-col">
      <button
        type="button"
        onClick={() => setOpenHelpPopover(open ? null : POPOVER_ID)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver)] shadow-[var(--shadow-md)] transition-colors hover:border-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
      >
        <span className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-[var(--bordo)]" />
          <span className="font-semibold">Diagnóstico</span>
          <span className="rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-1 py-0.5 font-mono text-[9px] tabular-nums text-[var(--bordo)]">
            {total}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 4, height: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 max-h-[60vh] overflow-y-auto rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-lg)]"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-[11px] leading-snug text-[var(--fg-muted)]">
                Lo que el análisis profundo no pudo confirmar. Más info, menos
                ciegas: si una clase rompe acá pero no aparece arriba, capaz
                tenés un falso negativo.
              </p>
              <button
                type="button"
                onClick={onDownloadPdf}
                disabled={downloading || !focusClass}
                title="Descargar reporte detallado en PDF"
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--bordo)]/60 bg-[var(--bordo)]/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--bordo)] transition-colors hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3" />
                    Descargar PDF
                  </>
                )}
              </button>
            </div>

            <DiagnosticGroup
              title="No resueltos"
              icon={<HelpCircle className="h-3 w-3" />}
              items={grouped.unresolved}
              tone="warn"
              hint="El parser falló al resolver el símbolo (puede ser una referencia al foco)."
            />
            <DiagnosticGroup
              title="Posibles falsos negativos"
              icon={<Eye className="h-3 w-3" />}
              items={grouped.falseNeg}
              tone="info"
              hint="El nombre del foco aparece pero el símbolo no se confirmó. Revisá manualmente."
            />
            <DiagnosticGroup
              title="Archivos no parseables"
              icon={<FileX className="h-3 w-3" />}
              items={grouped.unparseable}
              tone="error"
              hint="JavaParser no pudo abrir el archivo. Sintaxis rota o lombok delombok pendiente."
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DiagnosticGroup({
  title,
  icon,
  items,
  tone,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  items: Diagnostic[];
  tone: "warn" | "info" | "error";
  hint: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const toneClass =
    tone === "error"
      ? "text-red-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-[var(--silver)]";

  return (
    <div className="mb-3 last:mb-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-sm border border-[var(--border-silver)] bg-[var(--bg-input)] px-2 py-1.5 text-left transition-colors hover:border-[var(--bordo)]/50 ${toneClass}`}
      >
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
          {icon}
          <span className="font-semibold">{title}</span>
          <span className="rounded-sm bg-black/30 px-1 font-mono tabular-nums">
            {items.length}
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1.5 px-1">
          <p className="text-[10px] leading-snug text-[var(--fg-muted)]">
            {hint}
          </p>
          <ul className="flex flex-col gap-1.5">
            {items.map((d, i) => (
              <li
                key={`${d.file}-${d.line}-${i}`}
                className="rounded-sm border border-[var(--border-silver)]/60 bg-[var(--bg-input)] p-2 font-mono text-[10px] leading-tight"
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[var(--silver)]" title={d.file}>
                    {shortPath(d.file)}
                  </span>
                  {d.line > 0 && (
                    <span className="shrink-0 text-[var(--fg-muted)]">
                      :{d.line}
                    </span>
                  )}
                </div>
                {d.snippet && (
                  <pre className="mt-1 overflow-x-auto whitespace-pre rounded-sm bg-black/40 px-1.5 py-1 text-[var(--fg-primary)]">
                    {d.snippet}
                  </pre>
                )}
                {d.reason && (
                  <span className="text-[var(--fg-muted)]">↳ {d.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Display only the last 2-3 path segments so the dev sees enough context
 *  without the full absolute path. The full path is in the `title` attr. */
function shortPath(path: string): string {
  if (!path) return "";
  const norm = path.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  if (parts.length <= 3) return parts.join("/");
  return ".../" + parts.slice(-3).join("/");
}
