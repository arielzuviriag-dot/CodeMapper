"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, KeyRound, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IaChatPanel } from "@/components/iagrafo/IaChatPanel";
import { IaKeyGate } from "@/components/iagrafo/IaKeyGate";
import { PlanSourceSheet } from "@/components/iagrafo/PlanSourceSheet";
import { useIaGrafoStore } from "@/store/iaGrafoStore";
import { clearApiKey, getKeyStatus } from "@/lib/iaGrafo";

const PlanGraph = dynamic(
  () => import("@/components/iagrafo/PlanGraph").then((m) => m.PlanGraph),
  { ssr: false },
);

/**
 * IA.Grafo — pantalla principal de la nueva funcionalidad: chat con Claude a la
 * izquierda, grafo del plan de cambio al centro. Pedís un cambio → ves dónde y
 * por qué toca → click en una card abre el código en la línea → revisás/aplicás
 * el diff.
 */
export default function IaGrafoPage() {
  const router = useRouter();
  const hasKey = useIaGrafoStore((s) => s.hasKey);
  const setHasKey = useIaGrafoStore((s) => s.setHasKey);
  const plan = useIaGrafoStore((s) => s.plan);

  useEffect(() => {
    getKeyStatus().then((s) => setHasKey(s.hasKey));
  }, [setHasKey]);

  const onDisconnect = async () => {
    await clearApiKey();
    setHasKey(false);
  };

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header */}
      <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--border-silver)] px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="text-[var(--silver)] hover:bg-[var(--bg-panel)] hover:text-[var(--bordo)]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="text-xs uppercase tracking-[0.14em]">Volver</span>
          </Button>
          <span className="flex items-center gap-2 font-mono text-sm font-semibold text-[var(--fg-primary)]">
            <Network className="h-4 w-4 text-[var(--bordo)]" />
            IA.Grafo
          </span>
        </div>
        {hasKey && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDisconnect}
            className="gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--silver-dark)] hover:text-[var(--bordo)]"
            title="Desconectar la cuenta (borra la API key del servidor)"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Desconectar
          </Button>
        )}
      </header>

      {/* Cuerpo: chat | grafo */}
      <div className="flex min-h-0 flex-1">
        <div className="w-[420px] shrink-0">
          <IaChatPanel />
        </div>
        <div className="relative min-w-0 flex-1">
          {plan ? (
            <PlanGraph />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Network className="h-10 w-10 text-[var(--silver-dark)]" />
              <p className="font-mono text-sm text-[var(--silver-dark)]">
                El grafo del cambio aparece acá
              </p>
              <p className="max-w-xs text-xs text-[var(--silver-dark)]">
                Pedile a la IA un cambio en el chat y te dibujo todos los lugares
                que tocaría.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Overlays */}
      <IaKeyGate />
      <PlanSourceSheet />
    </main>
  );
}
