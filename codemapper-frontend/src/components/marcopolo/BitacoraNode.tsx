"use client";

import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useBitacoraStore } from "@/store/bitacoraStore";

interface BitacoraNodeData extends Record<string, unknown> {
  className: string;
  isOrigen: boolean;
  isActive: boolean;
}

/**
 * Node for the bitácora tree. Three visual states:
 *  • ORIGEN — 65px circle, bordó fill, anchor icon under the name. Always
 *    at the center of the panel and never moves.
 *  • VISITADO — 38px circle, neutral silver. The bulk of the tree.
 *  • ACTIVO  — 38px circle, slightly more saturated, plus a pulsing bordó
 *    ring (CSS animation) so the user can spot "where am I" at a glance.
 *
 * Tooltip on hover: full class name + visit count (= number of edges where
 * this node is the target). Visit count is computed off the store directly
 * so it stays live as new jumps land.
 */
function BitacoraNodeComponent({ data }: NodeProps) {
  const { className, isOrigen, isActive } = data as BitacoraNodeData;
  const [hovered, setHovered] = useState(false);

  // Visit count = how many edges land on this node. The origen has 0 by
  // definition (you never "land" on it via a jump — it's where you started).
  const visitCount = useBitacoraStore((s) =>
    s.edges.reduce((acc, e) => (e.target === className ? acc + 1 : acc), 0),
  );

  // Rectangles instead of circles so the className fits on one line — a
  // 65px circle had no usable horizontal real estate for "User.class".
  // Origen is wider/taller to keep the visual hierarchy.
  const width = isOrigen ? 140 : 110;
  const height = isOrigen ? 52 : 38;
  const ringClass = isActive ? "cm-bitacora-active-ring" : "";

  // Background: bordó for origen, silver tones for the rest. Active gets
  // a small saturation bump so it pops vs the plain visited nodes.
  const bgClass = useMemo(() => {
    if (isOrigen) return "bg-[var(--bordo)] text-white";
    if (isActive) return "bg-[var(--silver)] text-[var(--bg-base)]";
    return "bg-[var(--silver-mid)] text-[var(--bg-base)]";
  }, [isOrigen, isActive]);

  // Display name. Origen carries a ".class" suffix to read as Java
  // (`User.class`) and stays in PascalCase — matches the chip in the
  // top header of the page. Visited nodes show just the class name,
  // also PascalCase, no uppercase forced.
  const displayName = isOrigen ? `${className}.class` : className;
  // Truncation thresholds calibrated for the new rectangle sizes — at
  // their fonts, origen (12px mono in 140px wide) fits ~16 chars, visited
  // (10px in 110px wide) fits ~13. Cut with ellipsis so it never wraps.
  const truncateAt = isOrigen ? 16 : 13;
  const shown =
    displayName.length > truncateAt
      ? displayName.slice(0, truncateAt - 1) + "…"
      : displayName;

  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hidden source/target handles — React Flow needs them to anchor edges,
          but we don't render any visible UI. Edges use the floating-edge math
          inside BitacoraEdge so the handle position is irrelevant. */}
      <Handle type="source" position={Position.Top} className="!opacity-0" />
      <Handle type="target" position={Position.Top} className="!opacity-0" />

      <div
        className={`flex items-center justify-center rounded-md border border-[var(--border-silver)] font-mono font-semibold shadow-[var(--shadow-md)] transition-transform ${bgClass} ${ringClass}`}
        style={{
          width,
          height,
          fontSize: isOrigen ? "12px" : "10px",
          letterSpacing: "0.02em",
        }}
        aria-label={`${className}${isOrigen ? " (origen)" : ""}${isActive ? " (activo)" : ""}`}
      >
        {/* whitespace-nowrap forces the name + .class onto one line; truncate
            with ellipsis if it overflows so we never wrap inside the node. */}
        <span className="truncate whitespace-nowrap px-2 text-center leading-tight">
          {shown}
        </span>
      </div>

      {isOrigen && (
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--bordo)]">
          Origen
        </div>
      )}

      {hovered && (
        <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-sm border border-[var(--border-silver)] bg-[var(--bg-panel)] px-2 py-1 font-mono text-[10px] text-[var(--fg-primary)] shadow-[var(--shadow-lg)]">
          <div className="font-semibold">{className}</div>
          <div className="text-[9px] text-[var(--silver-mid)]">
            {visitCount === 0
              ? isOrigen
                ? "Punto de partida"
                : "Sin visitas registradas"
              : `${visitCount} visita${visitCount === 1 ? "" : "s"}`}
          </div>
        </div>
      )}
    </div>
  );
}

export const BitacoraNode = memo(BitacoraNodeComponent);
