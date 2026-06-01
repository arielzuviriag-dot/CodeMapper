"use client";

import { useState } from "react";
import { ClipboardCopy, ExternalLink, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useIaGrafoStore } from "@/store/iaGrafoStore";
import { buildManualPrompt, parseManualResponse } from "@/lib/iaGrafo";

/**
 * Modo manual (sin API): la app arma el prompt con contexto, el usuario lo
 * copia a claude.ai (su suscripción, sin costo de API), y pega la respuesta
 * acá. Parseamos el JSON y dibujamos el mismo grafo + diffs.
 */
export function ManualRelayPanel() {
  const projectPath = useIaGrafoStore((s) => s.projectPath);
  const setPlan = useIaGrafoStore((s) => s.setPlan);
  const addDiff = useIaGrafoStore((s) => s.addDiff);
  const addUserMessage = useIaGrafoStore((s) => s.addUserMessage);
  const startAssistant = useIaGrafoStore((s) => s.startAssistant);
  const appendAssistantText = useIaGrafoStore((s) => s.appendAssistantText);

  const [request, setRequest] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [generating, setGenerating] = useState(false);

  const onGenerate = async () => {
    const req = request.trim();
    if (!req) return;
    if (!projectPath.trim()) {
      toast.error("Primero indicá la ruta del proyecto");
      return;
    }
    setGenerating(true);
    try {
      const prompt = await buildManualPrompt(projectPath.trim(), req);
      setGenerated(prompt);
    } catch (err) {
      toast.error((err as Error).message ?? "No se pudo armar el prompt");
    } finally {
      setGenerating(false);
    }
  };

  const onCopy = () => {
    if (!generated) return;
    navigator.clipboard
      .writeText(generated)
      .then(() => toast.success("Prompt copiado — pegalo en claude.ai"))
      .catch(() => toast.error("No se pudo copiar"));
  };

  const onProcess = () => {
    if (!response.trim()) return;
    try {
      const { plan, diffs } = parseManualResponse(response);
      addUserMessage(request.trim() || "(pedido manual)");
      const aid = startAssistant();
      appendAssistantText(aid, plan.summary || "Plan recibido.");
      setPlan(plan);
      diffs.forEach(addDiff);
      toast.success(`Grafo dibujado — ${plan.nodes.length} lugar(es), ${diffs.length} cambio(s)`);
      setResponse("");
      setGenerated(null);
    } catch (err) {
      toast.error((err as Error).message ?? "No pude parsear la respuesta");
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border-silver)] p-3">
      {/* Paso 1: pedido → generar prompt */}
      <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
        <Sparkles className="h-3 w-3 text-[var(--bordo)]" /> 1 · Pedí el cambio
      </label>
      <textarea
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={2}
        placeholder="ej: renombrar el campo total de Pedido a montoTotal"
        className="resize-none rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-2.5 py-2 text-sm text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:border-[var(--bordo)] focus:outline-none"
      />
      <Button
        onClick={onGenerate}
        disabled={generating}
        className="gap-1.5 bg-[var(--bordo)] text-xs uppercase tracking-[0.12em] text-white hover:bg-[var(--bordo-mid)]"
      >
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        Generar prompt
      </Button>

      {/* Paso 2: copiar el prompt */}
      {generated && (
        <>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
              2 · Copialo y pegalo en claude.ai
            </span>
            <a
              href="https://claude.ai/new"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-[10px] text-[var(--bordo)] hover:underline"
            >
              abrir claude.ai <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <textarea
            readOnly
            value={generated}
            rows={4}
            className="resize-none rounded-md border border-[var(--border-silver)] bg-[var(--bg-panel)] px-2.5 py-2 font-mono text-[10px] text-[var(--silver)]"
          />
          {/* Tamaño del prompt: ayuda a estimar si entra y cuánto consume. */}
          <span className="text-right font-mono text-[10px] text-[var(--silver-dark)]">
            ≈ {Math.ceil(generated.length / 4).toLocaleString("es")} tokens ·{" "}
            {generated.length.toLocaleString("es")} caracteres
          </span>
          <Button
            onClick={onCopy}
            variant="outline"
            className="gap-1.5 border-[var(--border-silver)] text-xs uppercase tracking-[0.12em]"
          >
            <ClipboardCopy className="h-4 w-4" /> Copiar prompt
          </Button>

          {/* Paso 3: pegar la respuesta */}
          <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)]">
            3 · Pegá acá la respuesta de Claude
          </span>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={3}
            placeholder='Pegá el bloque ```json que te devolvió…'
            className="resize-none rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-2.5 py-2 font-mono text-[10px] text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:border-[var(--bordo)] focus:outline-none"
          />
          {response.trim() && (
            <span className="text-right font-mono text-[10px] text-[var(--silver-dark)]">
              respuesta ≈ {Math.ceil(response.length / 4).toLocaleString("es")} tokens ·{" "}
              {response.length.toLocaleString("es")} caracteres
            </span>
          )}
          {/* TOTAL del ida y vuelta: prompt (entrada) + respuesta (salida). */}
          {response.trim() && (
            <div className="rounded-md border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-2.5 py-1.5 text-center font-mono text-[11px] font-semibold text-[var(--bordo)]">
              TOTAL ≈{" "}
              {(
                Math.ceil(generated.length / 4) + Math.ceil(response.length / 4)
              ).toLocaleString("es")}{" "}
              tokens
              <span className="ml-1 font-normal text-[var(--silver-dark)]">
                (prompt {Math.ceil(generated.length / 4).toLocaleString("es")} + respuesta{" "}
                {Math.ceil(response.length / 4).toLocaleString("es")})
              </span>
            </div>
          )}
          <Button
            onClick={onProcess}
            disabled={!response.trim()}
            className="gap-1.5 bg-[var(--bordo)] text-xs uppercase tracking-[0.12em] text-white hover:bg-[var(--bordo-mid)]"
          >
            Dibujar el grafo
          </Button>
        </>
      )}
    </div>
  );
}
