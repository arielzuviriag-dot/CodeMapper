"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { UploadTabs } from "@/components/upload/UploadTabs";
import { resolveDemoMode } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";

const SCAN_DURATION = 7;

export default function HomePage() {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    resolveDemoMode();
    // Reset the chained-reanalysis flag so a fresh home → map flow uses the
    // full-screen loader (and not the inline one left over from a prior
    // FOCO SCANER navigation that the user abandoned).
    useGraphStore.getState().setPendingReanalysis(false);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Bordó radial glow — sober, not aggressive */}
      <div className="pointer-events-none absolute inset-0 cm-radial-glow opacity-90" />
      {/* Faint silver grid */}
      <div className="pointer-events-none absolute inset-0 cm-grid-bg opacity-60" />

      {/* CRT scan line — silver dashed, drifts top→bottom in loop */}
      {!prefersReducedMotion && <ScanLine />}

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-start gap-8 px-6 pb-16 pt-12">
        <header className="flex flex-col items-center gap-4 text-center">
          <CodeMapperNodeLogo />

          <div className="flex flex-col gap-3">
            <motion.h1
              className="cm-hero text-5xl sm:text-6xl"
              animate={
                prefersReducedMotion
                  ? undefined
                  : {
                      filter: [
                        "blur(0px)",
                        "blur(0px)",
                        "blur(0.5px)",
                        "blur(0px)",
                        "blur(0px)",
                      ],
                      x: [0, 0, 2, 0, 0],
                      opacity: [1, 1, 0.95, 1, 1],
                    }
              }
              transition={{
                duration: SCAN_DURATION,
                repeat: Infinity,
                ease: "linear",
                times: [0, 0.46, 0.5, 0.54, 1],
              }}
            >
              MapperView
            </motion.h1>
            <p className="max-w-xl text-balance text-base text-[var(--fg-secondary)] sm:text-lg">
              Visualizá la arquitectura de tu proyecto
            </p>
          </div>
        </header>

        <section
          className="cm-hairline-top w-full overflow-hidden rounded-xl border border-[var(--border-silver)] bg-[var(--bg-card)] p-6 shadow-2xl"
          style={{ boxShadow: "var(--shadow-xl)" }}
        >
          <UploadTabs />
        </section>

        <footer className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--bordo)] shadow-[0_0_8px_rgba(185,28,66,0.6)]" />
          Conectado a {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090"}
        </footer>
      </div>
    </main>
  );
}

/**
 * Horizontal scan line — silver dashed, faint bordó glow, top→bottom loop.
 * Fixed over the viewport, never blocks pointer events.
 */
function ScanLine() {
  return (
    <motion.div
      className="pointer-events-none fixed left-0 right-0 z-40 h-px"
      style={{
        backgroundImage:
          "repeating-linear-gradient(to right, rgba(192,192,200,0.4) 0 6px, transparent 6px 12px)",
        boxShadow: "0 0 8px rgba(185, 28, 66, 0.3)",
      }}
      initial={{ top: "-10px" }}
      animate={{ top: ["-10px", "100vh"] }}
      transition={{
        duration: SCAN_DURATION,
        repeat: Infinity,
        ease: "linear",
      }}
    />
  );
}

/**
 * CodeMapper node-network logo — diamond/rhombus topology.
 * Bordó top+bottom, silver sides, dashed silver across the middle.
 */
function CodeMapperNodeLogo() {
  const nodes = [
    { cx: 50, cy: 5, r: 12, fill: "#B91C42" },
    { cx: 12, cy: 70, r: 10, fill: "#C0C0C8" },
    { cx: 88, cy: 70, r: 10, fill: "#C0C0C8" },
    { cx: 50, cy: 105, r: 6, fill: "#B91C42" },
  ];

  return (
    <svg
      width="75"
      height="97"
      viewBox="0 -10 100 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="MapperView"
    >
      {/* Top edges — silver, going from top node to silver sides */}
      <line x1="50" y1="5" x2="12" y2="70" stroke="#C0C0C8" strokeWidth="1.5" strokeOpacity="0.6" />
      <line x1="50" y1="5" x2="88" y2="70" stroke="#C0C0C8" strokeWidth="1.5" strokeOpacity="0.6" />

      {/* Bottom edges — bordó, silver sides to bottom node */}
      <line x1="12" y1="70" x2="50" y2="105" stroke="#B91C42" strokeWidth="1.5" strokeOpacity="0.6" />
      <line x1="88" y1="70" x2="50" y2="105" stroke="#B91C42" strokeWidth="1.5" strokeOpacity="0.6" />

      {/* Dashed silver mid edge — left ↔ right */}
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
  );
}
