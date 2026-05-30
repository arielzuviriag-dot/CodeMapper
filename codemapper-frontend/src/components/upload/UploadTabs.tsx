"use client";

import { Bug, Crosshair, Folder, Radio, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadZone } from "./UploadZone";
import { LocalPathInput } from "./LocalPathInput";
import { FocusInput } from "./FocusInput";
import { ExceptionInput } from "./ExceptionInput";

const TRIGGER_CLASS = [
  "gap-2 rounded-[6px] text-xs uppercase tracking-[0.14em]",
  "cursor-pointer select-none transition-all duration-150",
  // hover on inactive — soft bordó tint + brighter text
  "hover:bg-[var(--bordo)]/12 hover:text-[var(--fg-primary)] hover:shadow-[0_0_14px_rgba(185,28,66,0.18)]",
  // press feedback (any state)
  "active:scale-[0.97] active:shadow-[0_0_10px_rgba(185,28,66,0.45)]",
  // active tab base
  "data-[state=active]:bg-[var(--bordo)] data-[state=active]:text-white data-[state=active]:shadow-[0_0_18px_rgba(185,28,66,0.4)]",
  // hover on the already-active tab — deeper bordó + stronger glow
  "data-[state=active]:hover:bg-[var(--bordo-mid)] data-[state=active]:hover:shadow-[0_0_24px_rgba(185,28,66,0.55)] data-[state=active]:hover:text-white",
].join(" ");

export function UploadTabs() {
  return (
    <Tabs defaultValue="upload" className="w-full">
      <TabsList className="grid w-full grid-cols-6 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-1">
        <TabsTrigger value="upload" className={TRIGGER_CLASS}>
          <Upload className="h-3.5 w-3.5" /> Aplicación
        </TabsTrigger>
        <TabsTrigger value="local" className={TRIGGER_CLASS}>
          <Folder className="h-3.5 w-3.5" /> Proyecto Java
        </TabsTrigger>
        <TabsTrigger value="focus" className={`${TRIGGER_CLASS} normal-case`}>
          <Crosshair className="h-3.5 w-3.5" /> Marco Polo
        </TabsTrigger>
        <TabsTrigger value="exception" className={`${TRIGGER_CLASS} normal-case`}>
          <Bug className="h-3.5 w-3.5" /> Bug
        </TabsTrigger>
        <TabsTrigger value="listening" className={`${TRIGGER_CLASS} normal-case`}>
          <Radio className="h-3.5 w-3.5" /> Escuchando
        </TabsTrigger>
        {/* TEMPORAL — tab para testear modo PRO sin tocar la URL.
            Borrar este TabsTrigger + el TabsContent="focus-pro" cuando
            exista billing real. Acción equivalente a `?demo=pro`. */}
        <TabsTrigger value="focus-pro" className={`${TRIGGER_CLASS} normal-case`}>
          <Sparkles className="h-3.5 w-3.5" /> Marco Polo PRO
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upload" className="mt-6">
        <UploadZone />
      </TabsContent>
      <TabsContent value="local" className="mt-6">
        <LocalPathInput />
      </TabsContent>
      <TabsContent value="focus" className="mt-6">
        <FocusInput />
      </TabsContent>
      <TabsContent value="exception" className="mt-6">
        <ExceptionInput />
      </TabsContent>
      <TabsContent value="focus-pro" className="mt-6">
        <FocusInput forcePro />
      </TabsContent>
      <TabsContent value="listening" className="mt-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-input)] p-8 text-center">
          <Radio className="h-8 w-8 text-[var(--bordo)]" strokeWidth={1.8} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[var(--fg-primary)]">
              Escuchá la ejecución en vivo
            </span>
            <span className="max-w-md text-xs leading-relaxed text-[var(--fg-secondary)]">
              Conectá tu app Java instrumentada con el agente OpenTelemetry y mirá
              cómo se van llamando las clases en tiempo real, con la estética del
              modo Foco.
            </span>
          </div>
          <Link
            href="/escuchar"
            className="flex items-center gap-2 rounded-md bg-[var(--bordo)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-all hover:bg-[var(--bordo-mid)] hover:shadow-[0_0_18px_rgba(185,28,66,0.45)]"
          >
            <Radio className="h-3.5 w-3.5" />
            Abrir modo Escuchando
          </Link>
        </div>
      </TabsContent>
    </Tabs>
  );
}
