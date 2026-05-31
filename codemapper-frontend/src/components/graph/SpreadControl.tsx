"use client";

import { Panel, type PanelPosition } from "@xyflow/react";
import { Minus, Plus } from "lucide-react";

/**
 * Control reutilizable "separador de cards" (+/−). Escala la distancia de las
 * cards al centro del grafo (mueve posiciones, no la cámara). Se usa en TODOS
 * los grafos para una interacción consistente. Por defecto va arriba de los
 * controles de zoom nativos (abajo a la izquierda).
 */
const STEP = 1.2;

interface Props {
  /** factor > 1 separa, < 1 junta. */
  onSpread: (factor: number) => void;
  position?: PanelPosition;
  style?: React.CSSProperties;
}

export function SpreadControl({
  onSpread,
  position = "bottom-left",
  style = { bottom: 120, left: 15 },
}: Props) {
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-sm text-[var(--silver)] hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)]";
  return (
    <Panel position={position} style={style}>
      <div className="flex flex-col items-center gap-1 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-md)]">
        <button type="button" onClick={() => onSpread(STEP)} title="Separar las cards" className={btn}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onSpread(1 / STEP)} title="Juntar las cards" className={btn}>
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </Panel>
  );
}
