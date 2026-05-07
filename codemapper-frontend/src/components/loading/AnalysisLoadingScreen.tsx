"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const LOADING_MESSAGES = [
  "Conectando con el servidor...",
  "Inicializando análisis...",
  "Preparando visualización...",
  "Esto puede tardar unos segundos...",
] as const;

const MESSAGE_INTERVAL_MS = 1500;

/**
 * Full-screen overlay shown between "Analizar" click and the first SSE
 * events arriving. Wrap with <AnimatePresence> in the parent to play the
 * fade-out when it unmounts.
 */
export function AnalysisLoadingScreen() {
  const prefersReducedMotion = useReducedMotion();
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        transition: { duration: prefersReducedMotion ? 0 : 0.4 },
      }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[var(--bg-base)]"
      role="status"
      aria-live="polite"
    >
      {/* Same ambient layers as the home — keeps the transition visually seamless */}
      <div className="pointer-events-none absolute inset-0 cm-radial-glow opacity-90" />
      <div className="pointer-events-none absolute inset-0 cm-grid-bg opacity-60" />

      <div className="relative flex flex-col items-center gap-8 px-6">
        <PulsingDiamondLogo reducedMotion={!!prefersReducedMotion} />

        <motion.p
          key={messageIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
          className="font-mono text-sm tracking-wide text-[var(--silver-mid)] sm:text-base"
        >
          {LOADING_MESSAGES[messageIndex]}
        </motion.p>

        <IndeterminateBar reducedMotion={!!prefersReducedMotion} />

        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--silver-dark)]">
          No cierres esta pestaña
        </p>
      </div>
    </motion.div>
  );
}

function PulsingDiamondLogo({ reducedMotion }: { reducedMotion: boolean }) {
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
      style={{ filter: "drop-shadow(0 0 24px rgba(185,28,66,0.45))" }}
    >
      <svg
        width="90"
        height="117"
        viewBox="0 -10 100 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="MapperView"
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

function IndeterminateBar({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      className="relative h-[2px] w-[240px] overflow-hidden rounded-full"
      style={{ backgroundColor: "rgba(192,192,200,0.18)" }}
    >
      <motion.div
        className="absolute top-0 h-full w-1/3 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(185,28,66,0.9) 50%, transparent 100%)",
          boxShadow: "0 0 12px rgba(185,28,66,0.45)",
        }}
        animate={reducedMotion ? { opacity: [0.5, 1, 0.5] } : { x: ["-100%", "340%"] }}
        transition={
          reducedMotion
            ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
            : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
        }
      />
    </div>
  );
}
