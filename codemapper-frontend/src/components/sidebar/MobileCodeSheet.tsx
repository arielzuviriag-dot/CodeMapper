"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Globe, MousePointerClick, Smartphone } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjectFile } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import {
  buildPreviewHtml,
  canSimulate,
  extractScreenElements,
} from "@/lib/screenElements";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * Read-only viewer for a front-end screen file (web or mobile). Opens when the
 * dev clicks a WEB_SCREEN / MOBILE_SCREEN node (or an Ariadna mobile step).
 * Three tabs:
 *   • Código     — the source (Monaco), like the Java class viewer.
 *   • Elementos  — the screen's interactive surface (forms, botones, links,
 *                  inputs, handlers, llamadas API) — the front-end analogue of
 *                  a Java class's fields/methods. Works for HTML5, HTML viejo,
 *                  JSP y JSX.
 *   • Simular    — a static, data-less preview (sandboxed iframe) for HTML/JSP.
 */
export function MobileCodeSheet() {
  const mobileFile = useGraphStore((s) => s.mobileFile);
  const closeMobileFile = useGraphStore((s) => s.closeMobileFile);
  const sessionId = useGraphStore((s) => s.sessionId);

  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mobileFile || !sessionId) {
      setSource(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setSource(null);
    setError(null);
    getProjectFile(sessionId, mobileFile.path)
      .then((res) => {
        if (!cancelled) setSource(res.sourceCode ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "No se pudo leer el archivo");
          setSource("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mobileFile, sessionId]);

  const path = mobileFile?.path ?? "";
  const isMobile = mobileFile?.kind === "mobile";
  const lang = /\.(tsx|ts|jsx|js)$/.test(path)
    ? "typescript"
    : /\.html?$/.test(path)
      ? "html"
      : /\.jsp$/.test(path)
        ? "html"
        : "javascript";

  const elements = useMemo(
    () => (source ? extractScreenElements(source) : null),
    [source],
  );

  const StackIcon = isMobile ? Smartphone : Globe;
  const accent = isMobile ? "#0F9D58" : "#2F81F7";

  return (
    <Sheet
      open={!!mobileFile}
      onOpenChange={(open) => {
        if (!open) closeMobileFile();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col border-l border-[var(--border-silver)] bg-[var(--bg-card)] p-0 sm:max-w-4xl xl:max-w-[64vw]"
      >
        <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] py-4 pl-6 pr-12">
          <SheetTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
            <StackIcon className="h-5 w-5" style={{ color: accent }} />
            <span className="truncate font-mono text-base font-semibold">
              {mobileFile?.name}
            </span>
            <span
              className="rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: accent, borderColor: `${accent}66` }}
            >
              {isMobile ? "Mobile" : "Web"}
            </span>
          </SheetTitle>
          <SheetDescription className="truncate font-mono text-xs text-[var(--silver-dark)]">
            {mobileFile?.path}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="code" className="flex flex-1 flex-col overflow-hidden px-6 pb-6 pt-3">
          <TabsList className="w-full justify-start gap-1 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-1">
            <TabsTrigger value="code" className="text-xs uppercase tracking-[0.14em]">
              Código
            </TabsTrigger>
            <TabsTrigger value="elements" className="text-xs uppercase tracking-[0.14em]">
              Elementos
            </TabsTrigger>
            <TabsTrigger value="simulate" className="text-xs uppercase tracking-[0.14em]">
              Simular
            </TabsTrigger>
          </TabsList>

          {/* Código */}
          <TabsContent value="code" className="mt-3 flex-1 overflow-hidden">
            <div className="flex h-full flex-col overflow-hidden rounded-md border border-[var(--border-silver)] shadow-[var(--shadow-md)]">
              {error && (
                <div className="border-b border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-3 py-2 text-xs text-[var(--bordo)]">
                  {error}
                </div>
              )}
              <div className="flex-1 overflow-hidden bg-[#0A0A0A]">
                {source === null ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <MonacoEditor
                    height="100%"
                    defaultLanguage={lang}
                    language={lang}
                    value={source}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      wordWrap: "off",
                    }}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          {/* Elementos */}
          <TabsContent value="elements" className="mt-3 flex-1 overflow-y-auto">
            {!elements ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ElementsView elements={elements} accent={accent} />
            )}
          </TabsContent>

          {/* Simular */}
          <TabsContent value="simulate" className="mt-3 flex-1 overflow-hidden">
            {source === null ? (
              <Skeleton className="h-full w-full" />
            ) : canSimulate(path) ? (
              <div className="flex h-full flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
                  Vista previa estática — sin datos ni backend
                </span>
                <iframe
                  title="Simulación"
                  sandbox=""
                  className="h-full w-full rounded-md border border-[var(--border-silver)] bg-white"
                  srcDoc={buildPreviewHtml(path, source)}
                />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-[var(--border-silver)] p-8 text-center">
                <MousePointerClick className="h-8 w-8" style={{ color: accent }} />
                <p className="max-w-md text-xs leading-relaxed text-[var(--fg-secondary)]">
                  Esta pantalla es un componente ({path.split(".").pop()}) que se
                  compila antes de correr, así que no se puede previsualizar sin
                  buildearla. En la pestaña <strong>Elementos</strong> tenés sus
                  botones, formularios y acciones. La simulación visual funciona
                  para HTML y JSP.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
        {title} <span className="opacity-60">({count})</span>
      </h4>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-[var(--border-silver)] bg-[var(--bg-input)] px-2 py-1 font-mono text-[11px] text-[var(--fg-primary)]">
      {children}
    </span>
  );
}

function ElementsView({
  elements,
  accent,
}: {
  elements: ReturnType<typeof extractScreenElements>;
  accent: string;
}) {
  const { forms, buttons, links, inputs, handlers, apiCalls } = elements;
  const total =
    forms.length +
    buttons.length +
    links.length +
    inputs.length +
    handlers.length +
    apiCalls.length;

  if (total === 0) {
    return (
      <p className="rounded-md border border-dashed border-[var(--border-silver)] p-6 text-center text-xs text-[var(--fg-muted)]">
        No se detectaron elementos interactivos en esta pantalla.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Formularios / acciones" count={forms.length}>
        {forms.map((f, i) => (
          <Pill key={i}>
            <span style={{ color: accent }}>{f.method}</span> → {f.action}
          </Pill>
        ))}
      </Section>
      <Section title="Llamadas al backend" count={apiCalls.length}>
        {apiCalls.map((c, i) => (
          <Pill key={i}>
            <span style={{ color: accent }}>{c.verb || "ANY"}</span> {c.path}
          </Pill>
        ))}
      </Section>
      <Section title="Botones" count={buttons.length}>
        <div className="flex flex-wrap gap-1.5">
          {buttons.map((b, i) => (
            <Pill key={i}>{b}</Pill>
          ))}
        </div>
      </Section>
      <Section title="Handlers / eventos" count={handlers.length}>
        {handlers.map((h, i) => (
          <Pill key={i}>{h}</Pill>
        ))}
      </Section>
      <Section title="Links" count={links.length}>
        {links.map((l, i) => (
          <Pill key={i}>
            {l.label} → {l.href}
          </Pill>
        ))}
      </Section>
      <Section title="Inputs" count={inputs.length}>
        <div className="flex flex-wrap gap-1.5">
          {inputs.map((inp, i) => (
            <Pill key={i}>
              {inp.name}:{inp.type}
            </Pill>
          ))}
        </div>
      </Section>
    </div>
  );
}
