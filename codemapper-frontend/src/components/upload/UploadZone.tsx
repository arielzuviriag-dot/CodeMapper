"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import JSZip from "jszip";
import { FileArchive, FolderOpen, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadProject } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface PreparedUpload {
  file: File;
  description: string;
  fileCount: number;
}

async function zipFiles(files: File[]): Promise<File> {
  const zip = new JSZip();
  for (const f of files) {
    const relPath =
      (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const buf = await f.arrayBuffer();
    zip.file(relPath, buf);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return new File([blob], "project.zip", { type: "application/zip" });
}

export function UploadZone() {
  const router = useRouter();
  const [prepared, setPrepared] = useState<PreparedUpload | null>(null);
  const [busy, setBusy] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;
    if (accepted.length === 1) {
      const f = accepted[0];
      if (f.name.endsWith(".zip") || f.name.endsWith(".java")) {
        setPrepared({
          file: f,
          description: f.name,
          fileCount: 1,
        });
        return;
      }
    }
    const javaFiles = accepted.filter((f) => f.name.endsWith(".java"));
    if (javaFiles.length === 0) {
      toast.error("Solo se aceptan archivos .java o .zip");
      return;
    }
    const zipped = await zipFiles(javaFiles);
    setPrepared({
      file: zipped,
      description: `${javaFiles.length} archivos .java (zipeados)`,
      fileCount: javaFiles.length,
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      "application/zip": [".zip"],
      "text/x-java-source": [".java"],
    },
  });

  const onFolderPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    const javaFiles = files.filter((f) => f.name.endsWith(".java"));
    if (javaFiles.length === 0) {
      toast.error("La carpeta no contiene archivos .java");
      return;
    }
    const folderName =
      (javaFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split(
        "/",
      )[0] ?? "carpeta";
    const zipped = await zipFiles(javaFiles);
    setPrepared({
      file: zipped,
      description: `${folderName} (${javaFiles.length} .java)`,
      fileCount: javaFiles.length,
    });
  };

  const onAnalyze = async () => {
    if (!prepared) return;
    setBusy(true);
    try {
      const res = await uploadProject(prepared.file);
      router.push(`/map/${res.sessionId}`);
    } catch {
      // toast already shown by interceptor
    } finally {
      setBusy(false);
    }
  };

  const clear = () => setPrepared(null);

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={`relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed p-8 transition-all duration-200 ${
          isDragActive
            ? "border-[var(--bordo)] bg-[var(--bordo)]/5 shadow-[0_0_24px_rgba(185,28,66,0.25)_inset]"
            : "border-[var(--border-default)] bg-[var(--bg-input)] hover:border-[var(--silver-dark)] hover:bg-[var(--bg-panel)]"
        }`}
      >
        {/* corner brackets — premium frame */}
        <CornerBrackets active={isDragActive} />

        <input {...getInputProps()} />
        <Upload
          className={`mb-3 h-10 w-10 transition-colors ${
            isDragActive ? "text-[var(--bordo)]" : "text-[var(--fg-muted)]"
          }`}
          strokeWidth={1.4}
        />
        <p className="text-sm font-medium text-[var(--fg-primary)]">
          {isDragActive
            ? "Soltá los archivos acá"
            : "Arrastrá archivos .java o un .zip"}
        </p>
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          o hacé click para elegir
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border-silver)]" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--fg-muted)]">
          o
        </span>
        <span className="h-px flex-1 bg-[var(--border-silver)]" />
      </div>

      <div>
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
          className="w-full border-[var(--border-silver)] bg-transparent uppercase tracking-[0.14em] hover:border-[var(--silver)] hover:bg-[var(--bg-panel)]"
          onClick={() => folderInputRef.current?.click()}
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          Seleccionar carpeta
        </Button>
      </div>

      {prepared && (
        <div className="cm-accent-bar-left flex items-center justify-between rounded-md border border-[var(--border-silver)] bg-[var(--bg-panel)] p-3 pl-4">
          <div className="flex items-center gap-3">
            <FileArchive className="h-5 w-5 text-[var(--bordo)]" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--fg-primary)]">
                {prepared.description}
              </span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
                listo para analizar
              </span>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={clear} disabled={busy}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Button
        onClick={onAnalyze}
        disabled={!prepared || busy}
        size="lg"
        className="bg-[var(--bordo)] uppercase tracking-[0.16em] text-white shadow-[0_0_24px_rgba(185,28,66,0.35)] hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_28px_rgba(185,28,66,0.55)] disabled:bg-[var(--bg-panel)] disabled:text-[var(--fg-muted)] disabled:shadow-none"
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Subiendo...
          </>
        ) : (
          "Analizar"
        )}
      </Button>
    </div>
  );
}

/** Decorative corner brackets — silver hairlines that turn bordó on drag */
function CornerBrackets({ active }: { active: boolean }) {
  const color = active ? "var(--bordo)" : "var(--silver-dark)";
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-3 h-3 w-3 border-l border-t transition-colors"
        style={{ borderColor: color }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 h-3 w-3 border-r border-t transition-colors"
        style={{ borderColor: color }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 bottom-3 h-3 w-3 border-b border-l transition-colors"
        style={{ borderColor: color }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 bottom-3 h-3 w-3 border-b border-r transition-colors"
        style={{ borderColor: color }}
      />
    </>
  );
}
