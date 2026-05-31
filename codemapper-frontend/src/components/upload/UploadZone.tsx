"use client";

import { useState } from "react";
import {
  Database,
  FolderTree,
  HardDrive,
  Layout,
  Loader2,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { analyzeLocalPath, resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * "Aplicación" — analiza el proyecto completo pasando las RUTAS físicas de cada
 * parte en la PC (como el tab "Java" / la pantalla de Escuchar), en vez de
 * subir carpetas. El backend Java es el que dispara el análisis (vía
 * {@link analyzeLocalPath} → POST /api/analyze/path, que lee la ruta directo).
 * Front-end y base de datos se ingresan como contexto del proyecto.
 */
export function UploadZone() {
  const router = useRouter();
  const [monorepoPath, setMonorepoPath] = useState("");
  const [frontendPath, setFrontendPath] = useState("");
  const [backendPath, setBackendPath] = useState("");
  const [dbPath, setDbPath] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

  const launch = (projectPath: string, frontPath: string | undefined, label: string) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    const demoMode = resolveDemoMode();
    // Fire-and-forget POST. El map page consume la promesa vía pendingAnalysis
    // bajo sessionId="pending" y redirige a la URL real cuando está listo.
    const promise = analyzeLocalPath(projectPath, demoMode, {
      frontendPath: frontPath,
    });
    useGraphStore.getState().setPendingAnalysis({
      promise,
      description: label,
      mode: "project",
      demo: demoMode === "pro" ? "pro" : undefined,
      projectPath,
    });
    const suffix = demoMode === "pro" ? "?demo=pro" : "";
    router.push(`/map/pending${suffix}`);
  };

  const onAnalyze = () => {
    const mono = monorepoPath.trim();
    if (mono) {
      // Monorepo: una sola carpeta padre con front y back juntos. Paso la misma
      // raíz como proyecto (parsea TODO el .java debajo) y como front (escanea
      // TODO el front debajo) → linkeo cruzado sobre el repo entero.
      launch(mono, mono, `Analizando monorepo ${baseName(mono)}...`);
      return;
    }
    const backend = backendPath.trim();
    if (!backend) {
      toast.error("Ingresá la carpeta del monorepo o la ruta del backend Java");
      return;
    }
    // Por partes: backend Java + (opcional) front. Igual que antes.
    launch(backend, frontendPath.trim() || undefined, `Analizando ${baseName(backend)}...`);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-[var(--border-silver)] bg-[var(--bg-panel)]/40 px-3 py-2.5 text-xs leading-relaxed text-[var(--fg-secondary)]">
        Analizá el proyecto completo de una aplicación. Si front y back viven en
        una misma carpeta, usá <strong className="text-[var(--fg-primary)]">Monorepo</strong>{" "}
        y estudio todo lo que haya adentro. Si están separados, cargalos por
        partes abajo.
      </p>

      <PathSlot
        icon={<FolderTree className="h-4 w-4" />}
        label="Monorepo"
        hint="Carpeta padre con front + back juntos — la recorro entera y conecto lo que encuentre"
        value={monorepoPath}
        onChange={setMonorepoPath}
        placeholder="C:\Users\ariel\Plixe"
        disabled={isAnalyzing}
        onEnter={onAnalyze}
      />

      <div className="flex items-center gap-3 py-0.5">
        <span className="h-px flex-1 bg-[var(--border-silver)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--silver-dark)]">
          o por partes
        </span>
        <span className="h-px flex-1 bg-[var(--border-silver)]" />
      </div>

      <PathSlot
        icon={<Layout className="h-4 w-4" />}
        label="Front end"
        hint="Ruta del front-end (web o React Native — se detecta solo)"
        value={frontendPath}
        onChange={setFrontendPath}
        placeholder="C:\Users\ariel\Reserva\frontend-reserva"
        disabled={isAnalyzing}
      />

      <PathSlot
        icon={<Server className="h-4 w-4" />}
        label="Backend"
        hint="Ruta del proyecto backend Java (obligatorio — es lo que se analiza)"
        topRow={
          <SegmentedRow
            value="java"
            onChange={() => {}}
            options={[{ value: "java", label: "Java" }]}
          />
        }
        value={backendPath}
        onChange={setBackendPath}
        placeholder="C:\Users\ariel\Reserva\backend-reserva"
        disabled={isAnalyzing}
        onEnter={onAnalyze}
      />

      <PathSlot
        icon={<Database className="h-4 w-4" />}
        label="Base de datos"
        hint="Ruta de la documentación de tablas (.md, .sql, .pdf, .txt)"
        value={dbPath}
        onChange={setDbPath}
        placeholder="C:\Users\ariel\Reserva\db-docs"
        disabled={isAnalyzing}
      />

      <p className="text-xs text-[var(--fg-muted)]">
        Solo desarrollo local. Las rutas se leen directamente desde el backend.
      </p>

      <Button
        onClick={onAnalyze}
        disabled={(!monorepoPath.trim() && !backendPath.trim()) || isAnalyzing}
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

interface PathSlotProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  topRow?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  onEnter?: () => void;
}

function PathSlot({
  icon,
  label,
  hint,
  topRow,
  value,
  onChange,
  placeholder,
  disabled,
  onEnter,
}: PathSlotProps) {
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

      <div className="flex items-center gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 py-2 transition-colors focus-within:border-[var(--bordo)] focus-within:shadow-[0_0_16px_rgba(185,28,66,0.25)]">
        <HardDrive className="h-4 w-4 shrink-0 text-[var(--silver-dark)]" />
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
          className="border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
        />
      </div>
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
