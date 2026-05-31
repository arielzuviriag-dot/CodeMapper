"use client";

import dynamic from "next/dynamic";
import { FileCode2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIaGrafoStore } from "@/store/iaGrafoStore";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * Visor de código de IA.Grafo. Al abrir una card, muestra su archivo y SALTA a
 * la línea del cambio (`line`): la centra y la resalta, así el usuario ve
 * directo el punto que la IA va a tocar.
 */
export function PlanSourceSheet() {
  const sourceView = useIaGrafoStore((s) => s.sourceView);
  const closeSource = useIaGrafoStore((s) => s.closeSource);

  return (
    <Sheet open={!!sourceView} onOpenChange={(open) => !open && closeSource()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col border-l border-[var(--border-silver)] bg-[var(--bg-card)] p-0 sm:max-w-4xl xl:max-w-[64vw]"
      >
        <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] py-4 pl-6 pr-12">
          <SheetTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
            <FileCode2 className="h-5 w-5 text-[var(--bordo)]" />
            <span className="truncate font-mono text-base font-semibold">
              {sourceView?.title}
            </span>
            {sourceView?.line != null && (
              <span className="rounded-sm border border-[var(--bordo)]/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
                línea {sourceView.line}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="truncate font-mono text-xs text-[var(--silver-dark)]">
            {sourceView?.path}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 px-6 pb-6 pt-4">
          <div className="flex h-full flex-col overflow-hidden rounded-md border border-[var(--border-silver)] shadow-[var(--shadow-md)]">
            <div className="flex-1 overflow-hidden bg-[#0A0A0A]">
              <MonacoEditor
                height="100%"
                language={sourceView?.language ?? "java"}
                value={sourceView?.source ?? ""}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "off",
                }}
                onMount={(editor, monaco) => {
                  const line = sourceView?.line;
                  if (line && line > 0) {
                    editor.revealLineInCenter(line);
                    editor.setPosition({ lineNumber: line, column: 1 });
                    editor.createDecorationsCollection([
                      {
                        range: new monaco.Range(line, 1, line, 1),
                        options: {
                          isWholeLine: true,
                          className: "cm-ia-changed-line",
                          linesDecorationsClassName: "cm-ia-changed-gutter",
                        },
                      },
                    ]);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
