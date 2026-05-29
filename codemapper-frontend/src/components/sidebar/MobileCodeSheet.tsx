"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjectFile } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * Ariadna — read-only code viewer for a mobile (RN) screen file. Opens when
 * the dev clicks a mobile screen node/step. Fetches the file by absolute path
 * via the generic /file endpoint (RN files aren't parsed ParsedClasses).
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

  const lang = mobileFile?.path.match(/\.(tsx|ts|jsx|js)$/)
    ? "typescript"
    : "javascript";

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
            <Smartphone className="h-5 w-5 text-[var(--silver)]" />
            <span className="truncate font-mono text-base font-semibold">
              {mobileFile?.name}
            </span>
            <span className="rounded-sm border border-[var(--silver)]/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--silver)]">
              Mobile
            </span>
          </SheetTitle>
          <SheetDescription className="truncate font-mono text-xs text-[var(--silver-dark)]">
            {mobileFile?.path}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 px-6 pb-6 pt-4">
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
