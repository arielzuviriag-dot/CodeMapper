"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import JSZip from "jszip";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileCode2,
  Folder,
  FolderOpen,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalysisLoadingScreen } from "@/components/loading/AnalysisLoadingScreen";
import { cn } from "@/lib/utils";
import { analyzeFocusUpload, resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const NAVIGATE_DELAY_MS = 200;
const PICKER_MAX_RESULTS = 80;
const RELEVANT_EXT = /\.(java|properties|yml|yaml|xml)$/i;
const EXCLUDED_PATH = /(?:^|\/)(target|build|node_modules|\.git|\.idea|\.vscode|out|bin|\.mvn)(?:\/|$)/i;
const HEAVY_FILE_COUNT = 1000;

interface PickedFolder {
  /** Folder name = first segment of webkitRelativePath. */
  name: string;
  /** All files included for upload (already filtered). */
  uploadFiles: File[];
  /** Total raw bytes — useful pre-submit warning. */
  totalSize: number;
  /** Just the .java files, with their path relative to the project root
   *  (i.e. without the folder name prefix), sorted alphabetically. */
  javaPaths: string[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function shouldInclude(rel: string): boolean {
  return RELEVANT_EXT.test(rel) && !EXCLUDED_PATH.test(rel);
}

function pickFolderFromFiles(rawFiles: File[]): PickedFolder | null {
  let folderName: string | null = null;
  const uploadFiles: File[] = [];
  const javaPaths: string[] = [];
  let totalSize = 0;

  for (const f of rawFiles) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (!rel) continue;
    if (folderName === null) folderName = rel.split("/")[0] ?? null;
    if (!shouldInclude(rel)) continue;
    uploadFiles.push(f);
    totalSize += f.size;
    if (rel.toLowerCase().endsWith(".java")) {
      const parts = rel.split("/");
      javaPaths.push(parts.slice(1).join("/"));
    }
  }
  if (folderName === null || javaPaths.length === 0) return null;
  javaPaths.sort();
  return { name: folderName, uploadFiles, totalSize, javaPaths };
}

async function buildZip(files: File[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) {
    const rel =
      (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    zip.file(rel, await f.arrayBuffer());
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function FocusInput() {
  const router = useRouter();

  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [focusFile, setFocusFile] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const pickerWrapRef = useRef<HTMLDivElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);

  const canSubmit = !!folder && !!focusFile && !isAnalyzing;

  // Click-outside / Escape close for the file picker
  useEffect(() => {
    if (!pickerOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        pickerWrapRef.current &&
        !pickerWrapRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    pickerSearchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const filteredFiles = useMemo(() => {
    if (!folder) return [];
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return folder.javaPaths.slice(0, PICKER_MAX_RESULTS);
    return folder.javaPaths
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, PICKER_MAX_RESULTS);
  }, [folder, pickerQuery]);

  const onFolderPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (raw.length === 0) return;
    const picked = pickFolderFromFiles(raw);
    if (!picked) {
      toast.error(
        "La carpeta no contiene archivos .java o no tiene la estructura esperada",
      );
      return;
    }
    setFolder(picked);
    setFocusFile(null);
    toast.success(
      `Carpeta "${picked.name}" — ${picked.javaPaths.length} archivos Java detectados`,
    );
  };

  const onChangeFolder = () => {
    setFolder(null);
    setFocusFile(null);
    setPickerOpen(false);
    setPickerQuery("");
    folderInputRef.current?.click();
  };

  const onAnalyze = async () => {
    if (!folder || !focusFile) return;
    setIsAnalyzing(true);
    try {
      const blob = await buildZip(folder.uploadFiles);
      const demoMode = resolveDemoMode();
      const res = await analyzeFocusUpload({
        zipBlob: blob,
        focusFile,
        demoMode,
      });
      // Uploaded sessions don't expose the server-side absolute path to the
      // client, so FOCO SCANER from the sheet is disabled — null this out
      // so any leftover value from a previous "ruta local" flow doesn't
      // confuse the sheet's relative-path computation.
      useGraphStore.getState().setProjectPath(null);
      setShowOverlay(true);
      const params = new URLSearchParams({ mode: "focus" });
      if (demoMode === "pro") params.set("demo", "pro");
      setTimeout(
        () => router.push(`/map/${res.sessionId}?${params.toString()}`),
        NAVIGATE_DELAY_MS,
      );
    } catch {
      // toast already shown by axios interceptor
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden folder picker — Chromium-only attrs handled via spread */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-expect-error - non-standard but supported in Chromium / WebKit
        webkitdirectory=""
        directory=""
        multiple
        onChange={onFolderPicked}
      />

      {/* ── Step 1: Folder ─────────────────────────────────────────── */}
      {!folder ? (
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          disabled={isAnalyzing}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-input)] px-6 py-7 text-[var(--silver)] transition-all hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/5 hover:shadow-[0_0_18px_rgba(185,28,66,0.2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60 disabled:opacity-50"
        >
          <FolderOpen className="h-8 w-8 text-[var(--silver-dark)]" strokeWidth={1.5} />
          <span className="text-sm font-medium text-[var(--fg-primary)]">
            Elegir carpeta del proyecto
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
            Solo .java, .properties, .yml, .xml — sin target ni .git
          </span>
        </button>
      ) : (
        <div className="cm-accent-bar-left flex items-center justify-between gap-3 rounded-md border border-[var(--border-silver)] bg-[var(--bg-panel)] p-3 pl-4">
          <div className="flex items-center gap-3">
            <Folder className="h-5 w-5 shrink-0 text-[var(--bordo)]" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-[var(--fg-primary)]">
                {folder.name}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
                <span className="tabular-nums text-[var(--silver)]">
                  {folder.javaPaths.length}
                </span>{" "}
                .java ·{" "}
                <span className="tabular-nums text-[var(--silver)]">
                  {folder.uploadFiles.length}
                </span>{" "}
                archivos ·{" "}
                <span className="tabular-nums text-[var(--silver)]">
                  {formatBytes(folder.totalSize)}
                </span>
              </span>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onChangeFolder}
            disabled={isAnalyzing}
            className="text-xs uppercase tracking-[0.14em] text-[var(--silver)] hover:bg-[var(--bg-card)] hover:text-[var(--fg-primary)]"
          >
            Cambiar
          </Button>
        </div>
      )}

      {/* ── Step 2: Focus .java picker ──────────────────────────────── */}
      <div className="relative flex flex-col gap-1" ref={pickerWrapRef}>
        <button
          type="button"
          onClick={() => {
            if (!folder) {
              toast.message("Primero elegí la carpeta del proyecto");
              return;
            }
            setPickerQuery("");
            setPickerOpen((v) => !v);
          }}
          disabled={!folder || isAnalyzing}
          aria-label="Elegir archivo .java de inicio"
          className={cn(
            "flex items-center gap-3 rounded-md border bg-[var(--bg-input)] px-3 py-2 text-left transition-colors",
            folder
              ? "border-[var(--border-silver)] hover:border-[var(--bordo)] hover:shadow-[0_0_14px_rgba(185,28,66,0.18)]"
              : "border-[var(--border-default)] opacity-60",
            pickerOpen &&
              "border-[var(--bordo)] shadow-[0_0_16px_rgba(185,28,66,0.25)]",
          )}
        >
          <FileCode2 className="h-4 w-4 shrink-0 text-[var(--silver-dark)]" />
          {focusFile ? (
            <span className="flex-1 truncate font-mono text-sm text-[var(--fg-primary)]">
              {focusFile}
            </span>
          ) : (
            <span className="flex-1 font-mono text-sm text-[var(--silver-dark)]">
              {folder ? "Elegir archivo .java de inicio..." : "Elegí una carpeta primero"}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-[var(--silver-dark)] transition-transform",
              pickerOpen && "rotate-180 text-[var(--bordo)]",
            )}
          />
        </button>
        <p className="px-1 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
          El archivo central del análisis FOCO — Nivel 1 de dependencias
        </p>

        <AnimatePresence>
          {pickerOpen && folder && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-[var(--bordo)]/40 bg-[var(--bg-panel)] shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
            >
              <div className="flex items-center gap-2 border-b border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-[var(--silver-mid)]" />
                <input
                  ref={pickerSearchRef}
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Buscar archivo .java..."
                  aria-label="Buscar archivo .java"
                  className="flex-1 bg-transparent font-mono text-xs leading-tight text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:outline-none"
                />
                {pickerQuery && (
                  <button
                    type="button"
                    onClick={() => setPickerQuery("")}
                    aria-label="Limpiar búsqueda"
                    className="text-[var(--silver-dark)] transition-colors hover:text-[var(--bordo)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="max-h-[260px] overflow-y-auto">
                {filteredFiles.length === 0 ? (
                  <div className="px-3 py-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
                    Sin coincidencias
                  </div>
                ) : (
                  <ul className="flex flex-col">
                    {filteredFiles.map((rel) => (
                      <li key={rel}>
                        <button
                          type="button"
                          onClick={() => {
                            setFocusFile(rel);
                            setPickerOpen(false);
                          }}
                          className={cn(
                            "group flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left font-mono text-[11px] leading-tight transition-colors hover:bg-[var(--bordo)]/12 hover:text-[var(--fg-primary)]",
                            focusFile === rel
                              ? "bg-[var(--bordo)]/20 text-[var(--bordo)]"
                              : "text-[var(--fg-secondary)]",
                          )}
                        >
                          <span className="truncate">{rel}</span>
                          <ChevronRight className="h-3 w-3 shrink-0 text-[var(--silver-dark)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--bordo)]" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {folder.javaPaths.length > PICKER_MAX_RESULTS &&
                  filteredFiles.length === PICKER_MAX_RESULTS && (
                    <div className="border-t border-[var(--border-silver)] px-3 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
                      +{folder.javaPaths.length - PICKER_MAX_RESULTS} más —
                      refiná la búsqueda
                    </div>
                  )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pre-submit summary + heavy-folder warning */}
      {folder && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-2 text-xs">
          <span className="text-[var(--silver-mid)]">
            Se subirán{" "}
            <span className="font-mono tabular-nums text-[var(--fg-primary)]">
              {folder.uploadFiles.length}
            </span>{" "}
            archivos{" "}
            <span className="text-[var(--silver-dark)]">
              ({formatBytes(folder.totalSize)})
            </span>
          </span>
          {folder.uploadFiles.length > HEAVY_FILE_COUNT && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--warning)]">
              <AlertTriangle className="h-3 w-3" />
              Puede tardar varios minutos
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-[var(--fg-muted)]">
        Modo FOCO: rastreamos las dependencias directas (nivel 1) del archivo
        elegido.
      </p>

      <Button
        onClick={onAnalyze}
        disabled={!canSubmit}
        size="lg"
        className={cn(
          "uppercase tracking-[0.16em] text-white",
          isAnalyzing
            ? "cursor-wait bg-[var(--bordo)] opacity-70 shadow-[0_0_12px_rgba(185,28,66,0.18)] hover:bg-[var(--bordo)] disabled:bg-[var(--bordo)] disabled:text-white disabled:opacity-70"
            : "bg-[var(--bordo)] shadow-[0_0_24px_rgba(185,28,66,0.35)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_28px_rgba(185,28,66,0.55)] disabled:bg-[var(--bg-panel)] disabled:text-[var(--fg-muted)] disabled:shadow-none",
        )}
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Subiendo y analizando...
          </>
        ) : (
          <>
            <Crosshair className="mr-2 h-4 w-4" />
            Analizar FOCO
          </>
        )}
      </Button>

      <AnimatePresence>
        {showOverlay && <AnalysisLoadingScreen />}
      </AnimatePresence>
    </div>
  );
}
