"use client";

import { Crosshair, Folder, Github, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadZone } from "./UploadZone";
import { GitHubInput } from "./GitHubInput";
import { LocalPathInput } from "./LocalPathInput";
import { FocusInput } from "./FocusInput";

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
      <TabsList className="grid w-full grid-cols-4 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-1">
        <TabsTrigger value="upload" className={TRIGGER_CLASS}>
          <Upload className="h-3.5 w-3.5" /> Aplicación
        </TabsTrigger>
        <TabsTrigger value="local" className={TRIGGER_CLASS}>
          <Folder className="h-3.5 w-3.5" /> Proyecto Java
        </TabsTrigger>
        <TabsTrigger value="github" className={TRIGGER_CLASS}>
          <Github className="h-3.5 w-3.5" /> GitHub
        </TabsTrigger>
        <TabsTrigger value="focus" className={`${TRIGGER_CLASS} normal-case`}>
          <Crosshair className="h-3.5 w-3.5" /> Foco
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upload" className="mt-6">
        <UploadZone />
      </TabsContent>
      <TabsContent value="local" className="mt-6">
        <LocalPathInput />
      </TabsContent>
      <TabsContent value="github" className="mt-6">
        <GitHubInput />
      </TabsContent>
      <TabsContent value="focus" className="mt-6">
        <FocusInput />
      </TabsContent>
    </Tabs>
  );
}
