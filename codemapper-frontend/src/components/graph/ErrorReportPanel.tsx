"use client";

import { useReactFlow } from "@xyflow/react";
import { AlertOctagon, MapPin, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useGraphStore } from "@/store/graphStore";
import { buildSteps, type ChainStep } from "./exceptionChain";

/** Simple name from an FQN ("com.foo.Bar" → "Bar"). */
function simpleNameOf(fqn: string | null | undefined): string {
  if (!fqn) return "";
  const dot = fqn.lastIndexOf(".");
  return dot >= 0 ? fqn.slice(dot + 1) : fqn;
}

/** Strip the package off an exception type for the headline. */
function shortType(type: string | null | undefined): string {
  return simpleNameOf(type) || (type ?? "Excepción");
}

/**
 * Ariadna — "Informe del error". Renders the deterministic exception report:
 * what blew up, where (root-cause throw site), and the full causal chain. Every
 * user-code class/method is a clickable link that:
 *   1. centers the matching node in the radial map, and
 *   2. opens the class sheet with the offending method's lines marked.
 *
 * Mounted INSIDE the ReactFlowProvider (FocusGraphInner) so it can drive the
 * viewport via useReactFlow.
 */
export function ErrorReportPanel() {
  const report = useGraphStore((s) => s.exceptionReport);
  const mobileOrigins = useGraphStore((s) => s.mobileOrigins);
  const openClassSheetAtMethod = useGraphStore((s) => s.openClassSheetAtMethod);
  const openMobileFile = useGraphStore((s) => s.openMobileFile);
  const { getNode, setCenter } = useReactFlow();

  if (!report) return null;

  const goToFrame = (classId: string | null, methodName: string | null) => {
    if (!classId) return;
    const node = getNode(classId);
    if (node) {
      const w = node.measured?.width ?? (node.width as number) ?? 220;
      const h = node.measured?.height ?? (node.height as number) ?? 150;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: 1,
        duration: 600,
      });
    }
    openClassSheetAtMethod(classId, methodName);
  };

  const steps = buildSteps(report, mobileOrigins);
  const hasChain = report.causes.length > 1;

  return (
    <div className="pointer-events-auto flex max-h-[calc(100vh-2rem)] w-[360px] flex-col overflow-hidden rounded-lg border border-[var(--bordo)]/60 bg-[var(--bg-card)] shadow-[0_0_28px_rgba(185,28,66,0.28)]">
      {/* Header — exception type + message */}
      <div className="cm-hairline-top flex flex-col gap-1 border-b border-[var(--border-silver)] bg-[var(--bordo)]/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 shrink-0 text-[var(--bordo)]" strokeWidth={2.4} />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--bordo)]">
            Informe del error
          </span>
        </div>
        <span className="font-mono text-sm font-semibold text-[var(--fg-primary)]">
          {shortType(report.topExceptionType)}
        </span>
        {report.topExceptionMessage && (
          <span className="break-words font-mono text-[11px] leading-snug text-[var(--silver)]">
            {report.topExceptionMessage}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto px-3 py-3">
        {/* Root cause (only when there's a Caused by chain) */}
        {hasChain && (
          <div className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-2.5 py-2">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
              Causa raíz
            </span>
            <div className="mt-0.5 font-mono text-[11px] text-[var(--bordo)]">
              {shortType(report.rootCauseType)}
            </div>
            {report.rootCauseMessage && (
              <div className="break-words font-mono text-[10px] leading-snug text-[var(--silver)]">
                {report.rootCauseMessage}
              </div>
            )}
          </div>
        )}

        {/* Where it blew up — the focus */}
        {report.focusClassId && (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
              <MapPin className="h-3 w-3 text-[var(--bordo)]" /> Dónde explotó
            </span>
            <button
              type="button"
              onClick={() => goToFrame(report.focusClassId, report.focusMethod)}
              className="group flex items-baseline gap-1 rounded-sm px-1 py-0.5 text-left font-mono text-[12px] leading-tight transition-colors hover:bg-[var(--bordo)]/10"
            >
              <span className="font-semibold text-[var(--fg-primary)] underline decoration-[var(--bordo)]/40 decoration-dotted underline-offset-2 group-hover:text-[var(--bordo)] group-hover:decoration-[var(--bordo)]">
                {simpleNameOf(report.focusFqn)}
                {report.focusMethod ? `.${report.focusMethod}()` : ""}
              </span>
              {report.focusLine > 0 && (
                <span className="text-[var(--silver-dark)]">·L{report.focusLine}</span>
              )}
            </button>
          </div>
        )}

        {/* Recorrido paso a paso — empieza en la pantalla/entrada y va
            "subiendo" hasta la clase donde surgió el error. */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
            Recorrido — paso a paso
          </span>
          <ol className="flex flex-col gap-1">
            {steps.map((step, i) => (
              <StepRow
                key={i}
                n={i + 1}
                step={step}
                onClass={goToFrame}
                onScreen={openMobileFile}
              />
            ))}
          </ol>
        </div>

        {/* AI teaser — kept deterministic by default (no tokens). */}
        <button
          type="button"
          onClick={() =>
            toast.message("Sugerir solución (IA)", {
              description:
                "Próximamente: explicación + fix sugerido. Consume IA solo bajo demanda.",
            })
          }
          className="mt-1 flex items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border-silver)] bg-[var(--bg-input)]/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)] transition-colors hover:border-[var(--bordo)]/60 hover:text-[var(--bordo)]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Sugerir solución (IA)
        </button>
      </div>
    </div>
  );
}

function StepRow({
  n,
  step,
  onClass,
  onScreen,
}: {
  n: number;
  step: ChainStep;
  onClass: (classId: string | null, methodName: string | null) => void;
  onScreen: (path: string, name: string) => void;
}) {
  const numBadge = (focus: boolean) => (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-semibold tabular-nums ${
        focus
          ? "bg-[var(--bordo)] text-white"
          : "border border-[var(--border-silver)] text-[var(--silver-dark)]"
      }`}
    >
      {n}
    </span>
  );

  if (step.kind === "screen") {
    return (
      <li>
        <button
          type="button"
          onClick={() => onScreen(step.screenFile, step.screenName)}
          className="group flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-left font-mono text-[11px] leading-tight transition-colors hover:bg-[var(--silver)]/10"
          title="Ver el código de la pantalla"
        >
          {numBadge(false)}
          <Smartphone className="h-3 w-3 shrink-0 text-[var(--silver)]" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[var(--fg-primary)] underline decoration-[var(--silver)]/40 decoration-dotted underline-offset-2 group-hover:text-[var(--silver)]">
              {step.screenName} · inicio
            </span>
            <span className="truncate text-[9px] text-[var(--silver-dark)]">
              {step.apiFunction}() · {step.method} {step.path}
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onClass(step.classId, step.methodName)}
        className="group flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-left font-mono text-[11px] leading-tight transition-colors hover:bg-[var(--bordo)]/10"
        title="Ver en el mapa y abrir el código"
      >
        {numBadge(step.isFocus)}
        {step.isFocus && (
          <AlertOctagon className="h-3 w-3 shrink-0 text-[var(--bordo)]" strokeWidth={2.4} />
        )}
        <span className="flex min-w-0 flex-col">
          <span
            className={`truncate underline decoration-dotted underline-offset-2 ${
              step.isFocus
                ? "font-semibold text-[var(--bordo)] decoration-[var(--bordo)]"
                : "text-[var(--fg-primary)] decoration-[var(--bordo)]/30 group-hover:text-[var(--bordo)] group-hover:decoration-[var(--bordo)]"
            }`}
          >
            {step.simpleName}.{step.methodName}()
            {step.lineNumber > 0 && (
              <span className="text-[var(--silver-dark)]"> ·L{step.lineNumber}</span>
            )}
          </span>
          {step.isFocus && (
            <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--bordo)]">
              ⛔ acá surgió el error
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
