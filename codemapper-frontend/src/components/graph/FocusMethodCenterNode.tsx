"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Crosshair, FileCode2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { analyzeFocus, resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import { useBitacoraStore } from "@/store/bitacoraStore";
import type { FocusMethodLoadedPayload } from "@/lib/types";

interface CenterData extends Record<string, unknown> {
  focus: FocusMethodLoadedPayload;
}

/** Relative path of `filePath` inside `projectPath`, or null when it's not
 *  under it. Mirrors ClassDetailSheet.computeRelativeFocusFile. */
function relFocusFile(projectPath: string, filePath: string): string | null {
  const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");
  const np = norm(projectPath);
  const nf = norm(filePath);
  if (!nf.startsWith(np)) return null;
  let rel = nf.slice(np.length);
  if (rel.startsWith("/")) rel = rel.slice(1);
  return rel;
}

function FocusMethodCenterNodeComponent({ data }: NodeProps) {
  const { focus } = data as CenterData;
  const router = useRouter();
  const projectPath = useGraphStore((s) => s.projectPath);
  const setPendingAnalysis = useGraphStore((s) => s.setPendingAnalysis);
  const setPendingReanalysis = useGraphStore((s) => s.setPendingReanalysis);

  const params = focus.parameters
    .map((p) => `${p.type} ${p.name}`)
    .join(", ");

  const canFocusClass = Boolean(
    projectPath &&
      focus.sourceFile &&
      relFocusFile(projectPath, focus.sourceFile) !== null,
  );

  const onFocusClass = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectPath || !focus.sourceFile) {
      toast.error("No tengo la ruta del proyecto para enfocar la clase");
      return;
    }
    const rel = relFocusFile(projectPath, focus.sourceFile);
    if (!rel) {
      toast.error("No se puede deducir el path relativo del archivo");
      return;
    }
    const demoMode = resolveDemoMode();
    const promise = analyzeFocus({ projectPath, focusFile: rel, demoMode });
    useGraphStore.getState().setPendingAnalysis({
      promise,
      description: `Analizando ${focus.containingClass}...`,
      mode: "focus",
      demo: demoMode === "pro" ? "pro" : undefined,
      projectPath,
    });
    // Bitácora — registramos el salto del método a su clase contenedora.
    useBitacoraStore.getState().addJump({
      fromClass: focus.containingClass,
      fromMethod: focus.methodName,
      toClass: focus.containingClass,
      toMethod: null,
    });
    setPendingReanalysis(true);
    const qs = new URLSearchParams({ mode: "focus" });
    if (demoMode === "pro") qs.set("demo", "pro");
    router.push(`/map/pending?${qs.toString()}`);
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex w-[320px] flex-col overflow-hidden rounded-lg border-2 border-[var(--bordo)] bg-[var(--bg-card)] text-[var(--fg-primary)]"
      style={{
        boxShadow:
          "0 0 28px rgba(185,28,66,0.55), 0 0 56px rgba(185,28,66,0.22), var(--shadow-md)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="target" position={Position.Right} className="!opacity-0" />
      <Handle type="source" position={Position.Top} id="src-top" className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} id="src-bottom" className="!opacity-0" />
      <Handle type="source" position={Position.Left} id="src-left" className="!opacity-0" />
      <Handle type="source" position={Position.Right} id="src-right" className="!opacity-0" />

      {/* Header */}
      <div className="flex items-center gap-2 bg-[var(--bordo)] px-3 py-2 text-white">
        <Crosshair className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span className="truncate font-mono text-sm font-semibold">
          {focus.containingClass}.{focus.methodName}()
        </span>
        <span className="ml-auto rounded-sm border border-white/30 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]">
          Foco método
        </span>
      </div>

      {/* Signature row */}
      <div className="border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-2 font-mono text-[10px] leading-snug text-[var(--silver)]">
        <span className="text-[var(--silver-dark)]">params:</span>{" "}
        <span className="text-[var(--fg-primary)]">{params || "()"}</span>
        <span className="mx-1.5 text-[var(--silver-dark)]">·</span>
        <span className="text-[var(--silver-dark)]">retorna:</span>{" "}
        <span className="text-[var(--bordo)]">{focus.returnType}</span>
      </div>

      {/* Footer with package */}
      <div className="truncate bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {focus.containingClassPackage || "(sin paquete)"}
      </div>

      {/* Acción — enfocar la clase entera que contiene este método */}
      {canFocusClass && (
        <button
          type="button"
          onClick={onFocusClass}
          className="nodrag flex items-center justify-center gap-1.5 border-t border-[var(--border-silver)] bg-[var(--bg-card)] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--silver)] transition-colors hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
          title={`Enfocar la clase ${focus.containingClass} completa`}
        >
          <FileCode2 className="h-3.5 w-3.5" />
          Foco a la clase {focus.containingClass}
        </button>
      )}
    </motion.div>
  );
}

export const FocusMethodCenterNode = memo(FocusMethodCenterNodeComponent);
