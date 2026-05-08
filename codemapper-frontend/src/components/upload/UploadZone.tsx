"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import JSZip from "jszip";
import {
  Database,
  FileArchive,
  FolderOpen,
  Layout,
  Loader2,
  Server,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveDemoMode, uploadProject } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface PreparedUpload {
  file: File;
  description: string;
  fileCount: number;
}

async function zipFiles(files: File[], zipName = "project.zip"): Promise<File> {
  const zip = new JSZip();
  for (const f of files) {
    const relPath =
      (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const buf = await f.arrayBuffer();
    zip.file(relPath, buf);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return new File([blob], zipName, { type: "application/zip" });
}

type FrontendKind = "web" | "react-native";

export function UploadZone() {
  const router = useRouter();
  const [frontend, setFrontend] = useState<PreparedUpload | null>(null);
  const [frontendKind, setFrontendKind] = useState<FrontendKind>("web");
  const [backend, setBackend] = useState<PreparedUpload | null>(null);
  const [dbDocs, setDbDocs] = useState<PreparedUpload | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const onAnalyze = async () => {
    if (!backend || isAnalyzing) return;
    setIsAnalyzing(true);
    const demoMode = resolveDemoMode();
    let sessionId: string;
    try {
      const res = await uploadProject(backend.file, demoMode);
      sessionId = res.sessionId;
    } catch {
      // toast already shown by interceptor — allow retry
      setIsAnalyzing(false);
      return;
    }
    const suffix = demoMode === "pro" ? "?demo=pro" : "";
    router.push(`/map/${sessionId}${suffix}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-panel)]/40 px-3 py-2.5 text-xs leading-relaxed text-[var(--fg-secondary)]">
        Analizá el proyecto completo de una aplicación. Subí la carpeta donde
        viven el front-end y el backend, más la documentación de la organización
        de la base de datos con todas sus tablas.
      </p>

      <FileSlot
        icon={<Layout className="h-4 w-4" />}
        label="Front end"
        hint={
          frontendKind === "web"
            ? "Carpeta o .zip del cliente (HTML, CSS, JS, React, etc.)"
            : "Carpeta o .zip del proyecto React Native / Expo"
        }
        topRow={
          <SegmentedRow
            value={frontendKind}
            onChange={setFrontendKind}
            options={[
              { value: "web", label: "Web" },
              { value: "react-native", label: "React Native" },
            ]}
          />
        }
        prepared={frontend}
        onPrepare={setFrontend}
        zipName="frontend.zip"
        accept={{ "application/zip": [".zip"] }}
      />

      <FileSlot
        icon={<Server className="h-4 w-4" />}
        label="Backend"
        hint="Archivos .java o un .zip con el código del servidor"
        topRow={
          <SegmentedRow
            value="java"
            onChange={() => {}}
            options={[{ value: "java", label: "Java" }]}
          />
        }
        prepared={backend}
        onPrepare={setBackend}
        zipName="backend.zip"
        accept={{
          "application/zip": [".zip"],
          "text/x-java-source": [".java"],
        }}
        javaOnly
      />

      <FileSlot
        icon={<Database className="h-4 w-4" />}
        label="Base de datos"
        hint="Documentación de tablas (.md, .sql, .pdf, .txt)"
        prepared={dbDocs}
        onPrepare={setDbDocs}
        zipName="db-docs.zip"
        accept={{
          "text/markdown": [".md"],
          "text/plain": [".txt", ".sql"],
          "application/pdf": [".pdf"],
        }}
      />

      <Button
        onClick={onAnalyze}
        disabled={!backend || isAnalyzing}
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
            Analizando...
          </>
        ) : (
          "Analizar"
        )}
      </Button>
    </div>
  );
}

interface FileSlotProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  topRow?: React.ReactNode;
  prepared: PreparedUpload | null;
  onPrepare: (p: PreparedUpload | null) => void;
  zipName: string;
  accept?: Record<string, string[]>;
  javaOnly?: boolean;
}

function FileSlot({
  icon,
  label,
  hint,
  topRow,
  prepared,
  onPrepare,
  zipName,
  accept,
  javaOnly,
}: FileSlotProps) {
  const folderInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (accepted.length === 0) return;
      if (accepted.length === 1) {
        const f = accepted[0];
        if (f.name.endsWith(".zip")) {
          onPrepare({ file: f, description: f.name, fileCount: 1 });
          return;
        }
        if (!javaOnly) {
          onPrepare({ file: f, description: f.name, fileCount: 1 });
          return;
        }
      }
      const filtered = javaOnly
        ? accepted.filter((f) => f.name.endsWith(".java"))
        : accepted;
      if (filtered.length === 0) {
        toast.error("Archivos no válidos para esta entrada");
        return;
      }
      const zipped = await zipFiles(filtered, zipName);
      onPrepare({
        file: zipped,
        description: `${filtered.length} archivos (zipeados)`,
        fileCount: filtered.length,
      });
    },
    [javaOnly, onPrepare, zipName],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept,
  });

  const onFolderPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    const filtered = javaOnly
      ? files.filter((f) => f.name.endsWith(".java"))
      : files;
    if (filtered.length === 0) {
      toast.error("La carpeta no contiene archivos válidos");
      return;
    }
    const folderName =
      (filtered[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split(
        "/",
      )[0] ?? "carpeta";
    const zipped = await zipFiles(filtered, zipName);
    onPrepare({
      file: zipped,
      description: `${folderName} (${filtered.length} archivos)`,
      fileCount: filtered.length,
    });
  };

  return (
    <div className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[var(--fg-primary)]">
        <div className="flex items-center gap-2">
          <span className="text-[var(--bordo)]">{icon}</span>
          <span className="text-sm font-medium uppercase tracking-[0.14em]">
            {label}
          </span>
        </div>
        {topRow ?? null}
      </div>
      <p className="mb-2.5 text-[11px] text-[var(--fg-muted)]">{hint}</p>

      {prepared ? (
        <div className="cm-accent-bar-left flex items-center justify-between rounded-md border border-[var(--border-silver)] bg-[var(--bg-panel)] p-2 pl-3">
          <div className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-[var(--bordo)]" />
            <span className="truncate text-xs text-[var(--fg-primary)]">
              {prepared.description}
            </span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => onPrepare(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div
            {...getRootProps()}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed px-3 py-2 text-[11px] transition-all",
              isDragActive
                ? "border-[var(--bordo)] bg-[var(--bordo)]/5 text-[var(--bordo)]"
                : "border-[var(--border-default)] text-[var(--fg-muted)] hover:border-[var(--silver-dark)] hover:text-[var(--fg-primary)]",
            )}
          >
            <input {...getInputProps()} />
            {isDragActive ? "Soltá acá" : "Arrastrá o click"}
          </div>
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            // @ts-expect-error - non-standard but supported in Chromium
            webkitdirectory=""
            directory=""
            multiple
            onChange={onFolderPicked}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[var(--border-silver)] bg-transparent uppercase tracking-[0.14em]"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            Carpeta
          </Button>
        </div>
      )}
    </div>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedRowProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
}

function SegmentedRow<T extends string>({
  value,
  onChange,
  options,
}: SegmentedRowProps<T>) {
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] transition-colors",
              active
                ? "border-[var(--bordo)] bg-[var(--bordo)]/15 text-[var(--bordo)] shadow-[0_0_10px_rgba(185,28,66,0.2)]"
                : "border-[var(--border-default)] bg-transparent text-[var(--fg-muted)] hover:border-[var(--silver-dark)] hover:text-[var(--fg-primary)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
