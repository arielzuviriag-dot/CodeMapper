"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { FREE_TIER_FILE_LIMIT, resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";

/**
 * Floats over the graph area while data is streaming and stays after it
 * completes — switching its copy from "Analizando..." to "Analizado" with
 * the final stats. Mount/unmount via <AnimatePresence> in the parent so the
 * card fades out only when the session resets, not when streaming ends.
 */
export function StreamingIndicator() {
  const prefersReducedMotion = useReducedMotion();

  const sessionStatus = useGraphStore((s) => s.sessionStatus);
  const nodeCount = useGraphStore((s) => s.nodes.size);
  const edgeCount = useGraphStore((s) => s.edges.length);
  const focusMode = useGraphStore((s) => s.focusMode);
  const focusMethodMode = useGraphStore((s) => s.focusMethodMode);
  const focusConnections = useGraphStore((s) => s.focusConnections.length);
  const limitReached = useGraphStore((s) => s.limitReached);

  const [isPro, setIsPro] = useState(false);
  useEffect(() => {
    setIsPro(resolveDemoMode() === "pro");
  }, []);

  const inAnyFocusMode = focusMode || focusMethodMode;
  const isComplete = sessionStatus === "complete";

  const headline = isComplete ? "Analizado" : "Analizando...";

  // ── Counter copy depending on mode + status ─────────────────────────
  let counterText: string;
  if (inAnyFocusMode) {
    if (isComplete) {
      counterText = limitReached.reached
        ? `${focusConnections} de ${limitReached.totalAvailable} conexiones`
        : `${focusConnections} conexiones de Nivel 1`;
    } else {
      counterText = isPro
        ? `Procesados: ${focusConnections} conexiones`
        : `Procesados: ${focusConnections} / 10`;
    }
  } else {
    if (isComplete) {
      counterText = limitReached.reached
        ? `${nodeCount} de ${limitReached.totalAvailable} clases · ${edgeCount} conexiones`
        : `${nodeCount} clases · ${edgeCount} conexiones`;
    } else {
      counterText = isPro
        ? `Procesados: ${nodeCount} clases`
        : `Procesados: ${nodeCount} / ${FREE_TIER_FILE_LIMIT}`;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: 4,
        transition: { duration: prefersReducedMotion ? 0 : 0.3 },
      }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      className="cm-hairline-top relative flex items-center gap-3 overflow-hidden rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] p-3 shadow-[0_0_20px_rgba(185,28,66,0.15)]"
      role="status"
      aria-live="polite"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at left, rgba(185,28,66,0.12) 0%, transparent 70%)",
        }}
      />

      <DiamondLogo
        reducedMotion={!!prefersReducedMotion}
        animate={!isComplete}
      />

      <div className="relative flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 font-mono text-sm tracking-wide text-[var(--silver-mid)]">
          {isComplete && (
            <CheckCircle2
              className="h-3.5 w-3.5 shrink-0 text-[var(--bordo)]"
              strokeWidth={2.2}
            />
          )}
          {headline}
          {isComplete && !isPro && (
            <span className="ml-auto rounded-sm bg-[var(--bordo)] px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-white">
              Free
            </span>
          )}
        </span>
        <span className="truncate font-mono text-[10px] tabular-nums uppercase tracking-[0.14em] text-[var(--silver-dark)]">
          {counterText}
        </span>
      </div>
    </motion.div>
  );
}

function DiamondLogo({
  reducedMotion,
  animate,
}: {
  reducedMotion: boolean;
  animate: boolean;
}) {
  const nodes = [
    { cx: 50, cy: 5, r: 12, fill: "#B91C42" },
    { cx: 12, cy: 70, r: 10, fill: "#C0C0C8" },
    { cx: 88, cy: 70, r: 10, fill: "#C0C0C8" },
    { cx: 50, cy: 105, r: 6, fill: "#B91C42" },
  ];

  const shouldAnimate = animate && !reducedMotion;

  return (
    <motion.div
      animate={shouldAnimate ? { scale: [1, 1.1, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
      transition={
        shouldAnimate
          ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.3 }
      }
      className="relative shrink-0"
      style={{ filter: "drop-shadow(0 0 8px rgba(185,28,66,0.45))" }}
    >
      <svg
        width="28"
        height="36"
        viewBox="0 -10 100 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <line x1="50" y1="5" x2="12" y2="70" stroke="#C0C0C8" strokeWidth="2" strokeOpacity="0.6" />
        <line x1="50" y1="5" x2="88" y2="70" stroke="#C0C0C8" strokeWidth="2" strokeOpacity="0.6" />
        <line x1="12" y1="70" x2="50" y2="105" stroke="#B91C42" strokeWidth="2" strokeOpacity="0.6" />
        <line x1="88" y1="70" x2="50" y2="105" stroke="#B91C42" strokeWidth="2" strokeOpacity="0.6" />
        <line
          x1="12"
          y1="70"
          x2="88"
          y2="70"
          stroke="#C0C0C8"
          strokeWidth="1.5"
          strokeOpacity="0.5"
          strokeDasharray="4 3"
        />
        {nodes.map((n, i) => (
          <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill={n.fill} />
        ))}
      </svg>
    </motion.div>
  );
}
