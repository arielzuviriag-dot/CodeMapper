import { UploadTabs } from "@/components/upload/UploadTabs";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary)_0%,_transparent_60%)] opacity-10" />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-12 px-6 py-16">
        <header className="flex flex-col items-center gap-6 text-center">
          <NetworkLogo />
          <div className="flex flex-col gap-3">
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
              <span className="bg-gradient-to-r from-primary via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                CodeMapper
              </span>
            </h1>
            <p className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              Visualizá la arquitectura de tu proyecto Java en tiempo real
            </p>
          </div>
        </header>

        <section className="w-full rounded-2xl border border-border bg-card/40 p-6 shadow-2xl backdrop-blur-sm">
          <UploadTabs />
        </section>

        <footer className="text-xs text-muted-foreground">
          Conectado a {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090"}
        </footer>
      </div>
    </main>
  );
}

function NetworkLogo() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-[0_0_24px_rgba(168,85,247,0.45)]"
    >
      <line x1="40" y1="20" x2="20" y2="50" stroke="currentColor" strokeWidth="1.5" className="text-primary/60" />
      <line x1="40" y1="20" x2="60" y2="50" stroke="currentColor" strokeWidth="1.5" className="text-primary/60" />
      <line x1="20" y1="50" x2="40" y2="65" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500/60" />
      <line x1="60" y1="50" x2="40" y2="65" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500/60" />
      <line x1="20" y1="50" x2="60" y2="50" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" className="text-zinc-500" />
      <circle cx="40" cy="20" r="6" className="fill-primary" />
      <circle cx="20" cy="50" r="5" className="fill-emerald-500" />
      <circle cx="60" cy="50" r="5" className="fill-emerald-500" />
      <circle cx="40" cy="65" r="4" className="fill-amber-500" />
    </svg>
  );
}
