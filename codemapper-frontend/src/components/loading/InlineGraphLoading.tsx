"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Lightweight loader rendered inside the graph area while a FOCO SCANER
 * navigation is in flight. Keeps the header + sidebar visible (unlike
 * AnalysisLoadingScreen, which covers everything) so the user feels the
 * transition is happening "inside" the existing analysis.
 */
export function InlineGraphLoading() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5"
      role="status"
      aria-live="polite"
    >
      <SpinningDiamondLogo reducedMotion={!!prefersReducedMotion} />
      <span className="font-mono text-base tracking-wider text-[var(--silver-mid)]">
        Analizando...
      </span>
    </motion.div>
  );
}

function SpinningDiamondLogo({ reducedMotion }: { reducedMotion: boolean }) {
  const nodes = [
    { cx: 50, cy: 5, r: 12, fill: "#B91C42" },
    { cx: 12, cy: 70, r: 10, fill: "#C0C0C8" },
    { cx: 88, cy: 70, r: 10, fill: "#C0C0C8" },
    { cx: 50, cy: 105, r: 6, fill: "#B91C42" },
  ];

  return (
    <motion.div
      animate={reducedMotion ? undefined : { rotate: 360 }}
      transition={
        reducedMotion
          ? undefined
          : { duration: 5, repeat: Infinity, ease: "linear" }
      }
      style={{ filter: "drop-shadow(0 0 16px rgba(185,28,66,0.45))" }}
    >
      <svg
        width="72"
        height="94"
        viewBox="0 -10 100 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <line x1="50" y1="5" x2="12" y2="70" stroke="#C0C0C8" strokeWidth="1.5" strokeOpacity="0.6" />
        <line x1="50" y1="5" x2="88" y2="70" stroke="#C0C0C8" strokeWidth="1.5" strokeOpacity="0.6" />
        <line x1="12" y1="70" x2="50" y2="105" stroke="#B91C42" strokeWidth="1.5" strokeOpacity="0.6" />
        <line x1="88" y1="70" x2="50" y2="105" stroke="#B91C42" strokeWidth="1.5" strokeOpacity="0.6" />
        <line
          x1="12"
          y1="70"
          x2="88"
          y2="70"
          stroke="#C0C0C8"
          strokeWidth="1"
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
