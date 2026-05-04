import { UploadTabs } from "@/components/upload/UploadTabs";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Bordó radial glow — sober, not aggressive */}
      <div className="pointer-events-none absolute inset-0 cm-radial-glow opacity-90" />
      {/* Faint silver grid */}
      <div className="pointer-events-none absolute inset-0 cm-grid-bg opacity-60" />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 py-16">
        <header className="flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-4">
            <CodeMapperLogo />
            <div className="h-10 w-px bg-[var(--border-silver)]" />
            <span className="cm-eyebrow">CODEMAPPER · v1.0</span>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="cm-hero text-5xl sm:text-6xl">CodeMapper</h1>
            <p className="max-w-xl text-balance text-base text-[var(--fg-secondary)] sm:text-lg">
              Visualizá la arquitectura de tu proyecto Java en tiempo real
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
 * CodeMapper monogram — bordó "CM" inside a silver hairline ring.
 * Refined, no glow excess, fits the BMW/Lambo aesthetic.
 */
function CodeMapperLogo() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CodeMapper"
    >
      <defs>
        <linearGradient id="cm-ring" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C0C0C8" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#6B6B73" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#C0C0C8" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="cm-fill" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5C0A1A" />
          <stop offset="100%" stopColor="#B91C42" />
        </linearGradient>
      </defs>

      <circle cx="28" cy="28" r="26" stroke="url(#cm-ring)" strokeWidth="1" />
      <circle cx="28" cy="28" r="22" fill="url(#cm-fill)" />

      {/* CM monogram */}
      <path
        d="M22.5 21.5C20 21.5 18 23.6 18 26.6V29.4C18 32.4 20 34.5 22.5 34.5C24.4 34.5 25.9 33.4 26.5 31.7"
        stroke="#F5F5F5"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M30 34.5V21.5L34 28L38 21.5V34.5"
        stroke="#F5F5F5"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
