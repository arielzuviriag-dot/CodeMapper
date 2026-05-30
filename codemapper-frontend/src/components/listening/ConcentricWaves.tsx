"use client";

/**
 * "Escuchando" mode — the water-ripple field behind the resting/listening
 * screen. Border-only rings born at the exact center and expanding outward
 * while fading, staggered so the field reads as continuous ripples.
 *
 * Visual intensity is driven entirely by CSS custom properties on the wrapper
 * class (see globals.css {@code .cm-waves-initial} / {@code .cm-waves-listening}):
 * "listening" makes the same rings faster and brighter, signalling that the
 * app is now actually receiving.
 */
const RING_COUNT = 5;
const MAX_RING_SIZE = 760; // px — the largest a ring grows to (at scale 1)

export function ConcentricWaves({
  intensified,
}: {
  intensified: boolean;
}) {
  const duration = intensified ? 3 : 6.5;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${
        intensified ? "cm-waves-listening" : "cm-waves-initial"
      }`}
    >
      {Array.from({ length: RING_COUNT }).map((_, i) => (
        <span
          key={i}
          className="cm-wave-ring"
          style={{
            width: MAX_RING_SIZE,
            height: MAX_RING_SIZE,
            // Evenly spread the rings across one full cycle so one is always
            // dissolving as another is being born.
            ["--cm-wave-delay" as string]: `${(duration / RING_COUNT) * i}s`,
          }}
        />
      ))}
    </div>
  );
}
