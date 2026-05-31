"use client";

import dynamic from "next/dynamic";
import { Coffee } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useListeningStore } from "@/store/listeningStore";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * "Escuchando" source viewer — shows the .java code of a class clicked in the
 * order panel. The source is already resolved (by fqcn under the backend path)
 * and stored in {@code sourceView}; this just renders it read-only.
 */
export function ListeningSourceSheet() {
  const sourceView = useListeningStore((s) => s.sourceView);
  const closeSource = useListeningStore((s) => s.closeSource);

  return (
    <Sheet
      open={!!sourceView}
      onOpenChange={(open) => {
        if (!open) closeSource();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col border-l border-[var(--border-silver)] bg-[var(--bg-card)] p-0 sm:max-w-4xl xl:max-w-[64vw]"
      >
        <SheetHeader className="cm-hairline-top border-b border-[var(--border-silver)] py-4 pl-6 pr-12">
          <SheetTitle className="flex items-center gap-2 text-[var(--fg-primary)]">
            <Coffee className="h-5 w-5 text-[var(--bordo)]" />
            <span className="truncate font-mono text-base font-semibold">
              {sourceView?.title}
            </span>
            <span className="rounded-sm border border-[var(--bordo)]/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
              Java
            </span>
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
                defaultLanguage="java"
                language="java"
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
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
