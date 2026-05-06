"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Persistent visual reassurance shown in the sidebar while the SSE stream
 * is still active. Mount/unmount via <AnimatePresence> in the parent so the
 * fade-out plays when sessionStatus !== 'streaming'.
 */
export function StreamingIndicator() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: 4,
        transition: { duration: prefersReducedMotion ? 0 : 0.4 },
      }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      className="cm-hairline-top relative flex items-center gap-3 overflow-hidden rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] p-3 shadow-[0_0_20px_rgba(185,28,66,0.15)]"
      role="status"
      aria-live="polite"
    >
      {/* Faint bordó wash inside the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at left, rgba(185,28,66,0.12) 0%, transparent 70%)",
        }}
      />

      <PulsingMiniLogo reducedMotion={!!prefersReducedMotion} />

      <span className="relative font-mono text-sm tracking-wide text-[var(--silver-mid)]">
        Analizando...
      </span>
    </motion.div>
  );
}

function PulsingMiniLogo({ reducedMotion }: { reducedMotion: boolean }) {
  const nodes = [
    { cx: 50, cy: 5, r: 12, fill: "#B91C42" },
    { cx: 12, cy: 70, r: 10, fill: "#C0C0C8" },
    { cx: 88, cy: 70, r: 10, fill: "#C0C0C8" },
    { cx: 50, cy: 105, r: 6, fill: "#B91C42" },
  ];

  return (
    <motion.div
      animate={
        reducedMotion
          ? undefined
          : { scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }
      }
      transition={
        reducedMotion
          ? undefined
          : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
      }
      className="relative shrink-0"
      style={{ filter: "drop-shadow(0 0 8px rgba(185,28,66,0.45))" }}
    >
      <svg
        width="32"
        height="40"
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
