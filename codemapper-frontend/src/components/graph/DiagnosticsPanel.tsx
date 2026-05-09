"use client";

import { useMemo, useState } from "react";
import {
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

/**
 * F-deep — content for the Diagnostics view: lists what deep-body analysis
 * couldn't confirm, in three buckets (UNRESOLVED / FALSE_NEG / UNPARSEABLE),
 * plus the PDF download button. Renders nothing when diagnostics is empty
 * so callers can render it unconditionally inside a Sheet body.
 *
 * This used to be a floating panel on the canvas; now it lives inside the
 * sidebar's "Diagnóstico" block (FocusDiagnosticsBlock in page.tsx) and
 * unfolds in a Sheet on the right when the user clicks.
 */
export function DiagnosticsContent() {
  const diagnostics = useGraphStore((s) => s.diagnostics);
  const focusClass = useGraphStore((s) => s.focusClass);
  const focusMethod = useGraphStore((s) => s.focusMethod);
  const detectedJavaVersion = useGraphStore((s) => s.detectedJavaVersion);
  const projectName = useGraphStore((s) => s.stats.projectName);
  const isPro = useGraphStore((s) => s.isPro);

  // In method-focus mode focusClass is null but focusMethod has the
  // containing class info. Either gives us a name + FQN to anchor the
  // diagnostics PDF to. focusContext === null only happens during the
  // pending/loading window; the panel is also hidden when diagnostics
  // is empty, so the gap doesn't matter in practice.
  const focusContext = focusClass
    ? {
        name: focusClass.name,
        fqn: focusClass.fullyQualifiedName ?? null,
        filenameSuffix: focusClass.name,
      }
    : focusMethod
      ? {
          name: `${focusMethod.containingClass}.${focusMethod.methodName}()`,
          fqn: `${focusMethod.containingClassFullyQualifiedName}#${focusMethod.methodName}`,
          filenameSuffix: `${focusMethod.containingClass}-${focusMethod.methodName}`,
        }
      : null;
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

  // Render nothing when empty so callers can mount this unconditionally
  // inside a Sheet body without empty UI artifacts.
  if (diagnostics.length === 0) return null;

  const onDownloadPdf = async () => {
    if (!focusContext || downloading) return;
    setDownloading(true);
    try {
      const blob = await exportDiagnosticsPdf({
        focusName: focusContext.name,
        focusFqn: focusContext.fqn,
        projectName: projectName ?? null,
        javaVersion: detectedJavaVersion ?? null,
        pro: isPro,
        diagnostics,
      });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const safeName = focusContext.filenameSuffix.replace(/[^A-Za-z0-9._-]/g, "_");
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
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] leading-snug text-[var(--fg-muted)]">
          Lo que el análisis profundo no pudo confirmar. Más info, menos
          ciegas: si una clase rompe acá pero no aparece arriba, capaz
          tenés un falso negativo.
        </p>
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={downloading || !focusContext}
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
