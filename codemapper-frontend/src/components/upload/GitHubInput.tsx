"use client";

import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeGithub } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function GitHubInput() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const onAnalyze = async () => {
    if (!url.trim()) {
      toast.error("Ingresá una URL de GitHub");
      return;
    }
    setBusy(true);
    try {
      const res = await analyzeGithub(url.trim());
      router.push(`/map/${res.sessionId}`);
    } catch {
      // toast handled
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Github className="h-5 w-5 text-muted-foreground" />
        <Input
          type="url"
          placeholder="https://github.com/usuario/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAnalyze();
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Solo repositorios públicos. Se clona y analiza en el servidor.
      </p>

      <Button onClick={onAnalyze} disabled={!url.trim() || busy} size="lg">
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Clonando...
          </>
        ) : (
          "Analizar"
        )}
      </Button>
    </div>
  );
}
