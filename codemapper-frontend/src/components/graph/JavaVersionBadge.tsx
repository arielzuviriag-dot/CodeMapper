"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Coffee, HelpCircle, X } from "lucide-react";
import {
  JAVA_FEATURES,
  featuresAvailable,
  featuresLockedBehind,
  parseJavaMajor,
} from "@/lib/javaCompat";
import { useGraphStore } from "@/store/graphStore";

const POPOVER_ID = "java-version";

/**
 * Discreet pill that surfaces the Java version detected from the project's
 * pom.xml/build.gradle. Click the (?) to open an educational popover that
 * lists what's currently lighting up vs what would unlock by upgrading.
 *
 * Honest by design: when no manifest is parseable, the pill says "Java ?"
 * and the popover lists everything CodeMapper supports — so the dev knows
 * the limitation is on their side, not the tool's.
 *
 * Coordinates with the global `openHelpPopover` slot so opening this auto-
 * closes any other help popover (Conexiones legend, Tipos legend, sidebar
 * foco glosario). Project-wide rule.
 */
export function JavaVersionBadge() {
  const detected = useGraphStore((s) => s.detectedJavaVersion);
  const openHelpPopover = useGraphStore((s) => s.openHelpPopover);
  const setOpenHelpPopover = useGraphStore((s) => s.setOpenHelpPopover);
  const open = openHelpPopover === POPOVER_ID;

  const major = parseJavaMajor(detected);
  const detectedKnown = major !== null;
  const available = featuresAvailable(detected);
  const locked = featuresLockedBehind(detected);

  return (
    <div className="relative">
      <div
        className="flex items-center gap-1.5 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver)] shadow-[var(--shadow-md)]"
        title={
          detectedKnown
            ? `Java ${major} detectado en pom.xml/build.gradle`
            : "No se detectó la versión de Java en pom.xml/build.gradle"
        }
      >
        <Coffee
          className="h-3 w-3 shrink-0 text-[var(--bordo)]"
          strokeWidth={2.2}
        />
        <span className="font-semibold">
          Java {detectedKnown ? major : "?"}
        </span>
        <button
          type="button"
          onClick={() => setOpenHelpPopover(open ? null : POPOVER_ID)}
          aria-label="Qué features se activan según la versión de Java"
          aria-expanded={open}
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[var(--silver-dark)] transition-colors hover:text-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60"
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Compatibilidad de features por versión de Java"
            initial={{ opacity: 0, x: 4, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            // Same anchor as Conexiones / Tipos legends — fixed positioning
            // relative to the viewport so all help popovers land in exactly
            // the same spot regardless of which trigger opened them. The
            // aside is ~170px wide at right:16px, so 194px places this card
            // just to the left of the aside. max-h + overflow keep long
            // content scrollable on small screens.
            className="fixed right-[194px] top-[80px] z-30 flex w-[320px] max-h-[calc(100vh-100px)] flex-col gap-3 overflow-y-auto rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
                Compatibilidad Java
              </span>
              <button
                type="button"
                onClick={() => setOpenHelpPopover(null)}
                aria-label="Cerrar"
                className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--silver-dark)] transition-colors hover:text-[var(--bordo)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {detectedKnown ? (
              <>
                <FeatureSection
                  title={`Lo que ves ahora (Java ${major})`}
                  features={available}
                  emptyHint="Tu versión es muy antigua para activar features modernas."
                  tone="active"
                />
                {locked.length > 0 ? (
                  <FeatureSection
                    title="Lo que verías si actualizaras"
                    features={locked}
                    emptyHint=""
                    tone="locked"
                  />
                ) : (
                  <div className="rounded-sm border border-[var(--bordo)]/30 bg-[var(--bordo)]/5 px-2 py-1.5 text-[10px] leading-snug text-[var(--bordo)]">
                    Tu proyecto ya está en la versión más nueva que CodeMapper
                    soporta — no hay nada por desbloquear.
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="rounded-sm border border-[var(--border-silver)] bg-[var(--bg-input)] px-2 py-1.5 text-[10px] leading-snug text-[var(--fg-secondary)]">
                  No encontramos <code className="font-mono">pom.xml</code> ni
                  <code className="font-mono"> build.gradle</code> con la
                  versión de Java declarada. Estamos parseando con el modo más
                  permisivo.
                </div>
                <FeatureSection
                  title="Todo lo que CodeMapper soporta"
                  features={JAVA_FEATURES}
                  emptyHint=""
                  tone="active"
                />
              </>
            )}

            <p className="border-t border-[var(--border-silver)] pt-2 text-[9px] leading-snug text-[var(--fg-muted)]">
              Estas features se activan automáticamente cuando subís la versión
              del proyecto. CodeMapper las soporta todas.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FeatureSection({
  title,
  features,
  emptyHint,
  tone,
}: {
  title: string;
  features: { label: string; description: string; minVersion: number }[];
  emptyHint: string;
  tone: "active" | "locked";
}) {
  const dotColor = tone === "active" ? "var(--bordo)" : "var(--silver-dark)";
  const labelColor =
    tone === "active" ? "text-[var(--fg-primary)]" : "text-[var(--silver-mid)]";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]">
        {title}
      </span>
      {features.length === 0 ? (
        <span className="text-[10px] italic text-[var(--fg-muted)]">
          {emptyHint}
        </span>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {features.map((f) => (
            <li key={f.label} className="flex items-start gap-1.5">
              <span
                className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: dotColor }}
                aria-hidden
              />
              <div className="flex flex-col gap-0.5">
                <span
                  className={`font-mono text-[10px] font-semibold leading-tight ${labelColor}`}
                >
                  {f.label}
                  {tone === "locked" && (
                    <span className="ml-1.5 rounded-sm border border-[var(--silver-dark)]/40 px-1 py-0.5 font-mono text-[8px] tracking-[0.14em] text-[var(--silver-dark)]">
                      Java {f.minVersion}+
                    </span>
                  )}
                </span>
                <span className="text-[10px] leading-snug text-[var(--fg-secondary)]">
                  {f.description}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
