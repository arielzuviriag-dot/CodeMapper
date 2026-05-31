"use client";

import { useReactFlow } from "@xyflow/react";
import { Maximize2, Minus, Plus, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGraphStore } from "@/store/graphStore";

interface Props {
  onRelayout: () => void;
  /** Spread (factor > 1) or pull together (factor < 1) the cards themselves. */
  onSpread: (factor: number) => void;
}

/** Cuánto se separan/juntan las cards por cada clic en + / −. */
const SPREAD_STEP = 1.2;

export function GraphControls({ onRelayout, onSpread }: Props) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const resetUserInteraction = useGraphStore((s) => s.resetUserInteraction);

  const btn =
    "h-9 w-9 rounded-sm bg-transparent text-[var(--silver)] hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)]";

  return (
    <div className="absolute right-4 top-4 z-10 flex flex-row items-center gap-1 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-md)]">
      {/* Cámara: acerca/aleja la vista (no mueve las cards). */}
      <Button
        size="icon"
        variant="ghost"
        onClick={() => zoomIn({ duration: 200 })}
        title="Zoom in (acerca la vista)"
        className={btn}
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => zoomOut({ duration: 200 })}
        title="Zoom out (aleja la vista)"
        className={btn}
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => fitView({ duration: 400, padding: 0.2 })}
        title="Centrar"
        className={btn}
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          resetUserInteraction();
          onRelayout();
        }}
        title="Reset layout"
        className={btn}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>

      <div className="mx-0.5 h-6 w-px bg-[var(--border-silver)]" />

      {/* Separador: aleja/acerca las cards entre sí (mueve sus posiciones). */}
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onSpread(SPREAD_STEP)}
        title="Separar las cards"
        className={btn}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onSpread(1 / SPREAD_STEP)}
        title="Juntar las cards"
        className={btn}
      >
        <Minus className="h-4 w-4" />
      </Button>
    </div>
  );
}
