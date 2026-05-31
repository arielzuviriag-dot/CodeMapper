"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useIaGrafoStore } from "@/store/iaGrafoStore";
import { streamChat } from "@/lib/iaGrafo";
import { DiffViewer } from "./DiffViewer";
import { ManualRelayPanel } from "./ManualRelayPanel";

/**
 * Panel de chat de IA.Grafo. El usuario pide un cambio; el panel streamea la
 * respuesta de Claude (texto + pasos de exploración), y a medida que llegan los
 * eventos `plan`/`diff` alimenta el grafo (store) y el visor de diffs.
 */
export function IaChatPanel() {
  const projectPath = useIaGrafoStore((s) => s.projectPath);
  const setProjectPath = useIaGrafoStore((s) => s.setProjectPath);
  const manualMode = useIaGrafoStore((s) => s.manualMode);
  const setManualMode = useIaGrafoStore((s) => s.setManualMode);
  const messages = useIaGrafoStore((s) => s.messages);
  const streaming = useIaGrafoStore((s) => s.streaming);
  const setStreaming = useIaGrafoStore((s) => s.setStreaming);
  const addUserMessage = useIaGrafoStore((s) => s.addUserMessage);
  const startAssistant = useIaGrafoStore((s) => s.startAssistant);
  const appendAssistantText = useIaGrafoStore((s) => s.appendAssistantText);
  const addAssistantStep = useIaGrafoStore((s) => s.addAssistantStep);
  const setPlan = useIaGrafoStore((s) => s.setPlan);
  const addDiff = useIaGrafoStore((s) => s.addDiff);

  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    if (!projectPath.trim()) {
      toast.error("Primero indicá la ruta del proyecto a analizar");
      return;
    }
    setInput("");

    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    addUserMessage(prompt);
    const assistantId = startAssistant();
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(
        { projectPath: projectPath.trim(), prompt, history },
        (ev) => {
          switch (ev.type) {
            case "text":
              appendAssistantText(assistantId, (ev.text ?? "") + "\n");
              break;
            case "step":
              addAssistantStep(assistantId, ev.label);
              break;
            case "plan":
              setPlan(ev.plan);
              break;
            case "diff":
              addDiff(ev.diff);
              break;
            case "error":
              appendAssistantText(assistantId, `\n⚠️ ${ev.message}`);
              toast.error(ev.message);
              break;
            case "done":
              break;
          }
        },
        ctrl.signal,
      );
    } catch (err) {
      if (!ctrl.signal.aborted) {
        appendAssistantText(assistantId, `\n⚠️ ${(err as Error).message}`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <div className="flex h-full flex-col border-r border-[var(--border-silver)] bg-[var(--bg-card)]">
      {/* Ruta del proyecto + toggle de modo */}
      <div className="border-b border-[var(--border-silver)] p-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--silver-dark)]">
            Proyecto a analizar
          </label>
          <button
            type="button"
            onClick={() => setManualMode(!manualMode)}
            title="Modo manual: armás el prompt y lo pegás en claude.ai (sin costo de API)"
            className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors ${
              manualMode
                ? "border-[var(--bordo)] bg-[var(--bordo)]/15 text-[var(--bordo)]"
                : "border-[var(--border-silver)] text-[var(--silver-dark)] hover:text-[var(--bordo)]"
            }`}
          >
            {manualMode ? "Modo manual (sin API)" : "Modo API"}
          </button>
        </div>
        <input
          type="text"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="ruta absoluta — ej: C:\Users\ariel\Reserva\backend-reserva"
          className="w-full rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-2.5 py-1.5 font-mono text-xs text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:border-[var(--bordo)] focus:outline-none"
        />
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-2 px-4 text-center">
            <Sparkles className="h-8 w-8 text-[var(--bordo)]" />
            <p className="font-mono text-sm text-[var(--silver)]">IA.Grafo</p>
            <p className="text-xs leading-relaxed text-[var(--silver-dark)]">
              Pedí un cambio (ej: <em>&ldquo;renombrar el campo total de Pedido a
              montoTotal&rdquo;</em>) y te muestro en el grafo todos los lugares que
              tocaría y por qué, con el código y el diff aplicable.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-[var(--bordo)] text-white"
                  : "border border-[var(--border-silver)] bg-[var(--bg-panel)] text-[var(--fg-primary)]"
              }`}
            >
              {m.role === "assistant" && m.steps && m.steps.length > 0 && (
                <div className="mb-1.5 space-y-0.5">
                  {m.steps.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 font-mono text-[10px] text-[var(--silver-dark)]"
                    >
                      <ChevronRight className="h-3 w-3 text-[var(--bordo)]" />
                      {s}
                    </div>
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap leading-relaxed">{m.text || (m.role === "assistant" && streaming ? "…" : "")}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Diffs propuestos */}
      <DiffViewer />

      {/* Modo manual: relay de copiar/pegar (sin API). */}
      {manualMode && <ManualRelayPanel />}

      {/* Input (modo API) */}
      {!manualMode && (
      <div className="border-t border-[var(--border-silver)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="¿Qué cambio querés hacer?"
            className="flex-1 resize-none rounded-md border border-[var(--border-silver)] bg-[var(--bg-input)] px-2.5 py-2 text-sm text-[var(--fg-primary)] placeholder:text-[var(--silver-dark)] focus:border-[var(--bordo)] focus:outline-none"
          />
          {streaming ? (
            <Button
              onClick={stop}
              variant="outline"
              className="h-[44px] border-[var(--border-silver)] text-xs"
            >
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Detener
            </Button>
          ) : (
            <Button
              onClick={send}
              className="h-[44px] gap-1.5 bg-[var(--bordo)] text-white hover:bg-[var(--bordo-mid)]"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
