"use client";

import { Crosshair, Folder, Github, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadZone } from "./UploadZone";
import { GitHubInput } from "./GitHubInput";
import { LocalPathInput } from "./LocalPathInput";
import { FocusInput } from "./FocusInput";

const TRIGGER_CLASS =
  "gap-2 rounded-[6px] text-xs uppercase tracking-[0.14em] data-[state=active]:bg-[var(--bordo)] data-[state=active]:text-white data-[state=active]:shadow-[0_0_18px_rgba(185,28,66,0.4)]";

export function UploadTabs() {
  return (
    <Tabs defaultValue="upload" className="w-full">
      <TabsList className="grid w-full grid-cols-4 rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] p-1">
        <TabsTrigger value="upload" className={TRIGGER_CLASS}>
          <Upload className="h-3.5 w-3.5" /> Subir
        </TabsTrigger>
        <TabsTrigger value="local" className={TRIGGER_CLASS}>
          <Folder className="h-3.5 w-3.5" /> Ruta local
        </TabsTrigger>
        <TabsTrigger value="github" className={TRIGGER_CLASS}>
          <Github className="h-3.5 w-3.5" /> GitHub
        </TabsTrigger>
        <TabsTrigger value="focus" className={TRIGGER_CLASS}>
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
