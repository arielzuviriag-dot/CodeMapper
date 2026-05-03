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
        className={`relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent/30"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isDragActive
            ? "Soltá los archivos acá"
            : "Arrastrá archivos .java o un .zip"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          o hacé click para elegir
        </p>
      </div>

      <div className="flex items-center justify-center">
        <span className="text-xs text-muted-foreground">— o —</span>
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
          className="w-full"
          onClick={() => folderInputRef.current?.click()}
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          Seleccionar carpeta
        </Button>
      </div>

      {prepared && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <FileArchive className="h-5 w-5 text-primary" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{prepared.description}</span>
              <span className="text-xs text-muted-foreground">
                listo para analizar
              </span>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={clear} disabled={busy}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Button onClick={onAnalyze} disabled={!prepared || busy} size="lg">
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
