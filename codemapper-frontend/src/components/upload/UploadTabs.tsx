"use client";

import { Folder, Github, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadZone } from "./UploadZone";
import { GitHubInput } from "./GitHubInput";
import { LocalPathInput } from "./LocalPathInput";

export function UploadTabs() {
  return (
    <Tabs defaultValue="upload" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="upload" className="gap-2">
          <Upload className="h-4 w-4" /> Subir archivos
        </TabsTrigger>
        <TabsTrigger value="local" className="gap-2">
          <Folder className="h-4 w-4" /> Ruta local
        </TabsTrigger>
        <TabsTrigger value="github" className="gap-2">
          <Github className="h-4 w-4" /> GitHub
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
    </Tabs>
  );
}
