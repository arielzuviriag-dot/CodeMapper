"use client";

import { motion } from "framer-motion";
import { Network } from "lucide-react";
import { useBitacoraStore } from "@/store/bitacoraStore";

/**
 * Floating chip that surfaces the bitácora's current node count and acts
 * as the toggle for the floating panel. Lives next to the StreamingIndicator
 * (bottom-left of the Marco Polo graph) so the two read as a related cluster.
 *
 * Hidden until the bitácora has at least the origen — there's no point
 * showing "0 clases" before the first focus_class_loaded arrives.
 */
export function BitacoraIndicator() {
  const nodeCount = useBitacoraStore((s) => s.nodes.length);
  const isPanelOpen = useBitacoraStore((s) => s.isPanelOpen);
  const togglePanel = useBitacoraStore((s) => s.togglePanel);

  if (nodeCount === 0) return null;

  return (
    <motion.button
      type="button"
      onClick={togglePanel}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      aria-pressed={isPanelOpen}
      aria-label={`Árbol — ${nodeCount} ${nodeCount === 1 ? "clase" : "clases"} recorrida${nodeCount === 1 ? "" : "s"}. Click para abrir el panel.`}
      className={`cm-hairline-top relative flex items-center gap-2 rounded-lg border bg-[var(--bg-card)] px-3 py-3 shadow-[var(--shadow-md)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60 ${
        isPanelOpen
          ? "border-[var(--bordo)] text-[var(--bordo)] shadow-[0_0_18px_rgba(185,28,66,0.35)]"
          : "border-[var(--border-silver)] text-[var(--silver)] hover:border-[var(--bordo)] hover:text-[var(--bordo)]"
      }`}
    >
      <Network
        className={`h-4 w-4 ${isPanelOpen ? "text-[var(--bordo)]" : "text-[var(--bordo)]"}`}
        strokeWidth={2.2}
      />
      <span className="flex flex-col items-start leading-tight">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]">
          Árbol
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[var(--silver-mid)]">
          {nodeCount} {nodeCount === 1 ? "clase" : "clases"}
        </span>
      </span>
    </motion.button>
  );
}
