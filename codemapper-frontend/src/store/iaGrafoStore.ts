"use client";

import { create } from "zustand";
import type {
  ChangePlan,
  ChatMessage,
  PlanNode,
  ProposedDiff,
} from "@/lib/iaGrafo";

/**
 * Store de IA.Grafo — separado por completo del resto (graphStore / listening)
 * para no tocar los modos existentes. Guarda la conversación, el plan de cambio
 * vigente (que se pinta como grafo), los diffs propuestos y el estado de UI
 * (qué card está seleccionada, visor de código abierto, etc.).
 */

export interface SourceView {
  title: string;
  source: string;
  path: string;
  /** Lenguaje para Monaco (java, typescript, xml, …). */
  language?: string;
  /** Línea a resaltar/centrar al abrir (1-based). */
  line?: number;
}

interface IaGrafoState {
  /** Ruta del proyecto a analizar (la pega el usuario, como en Escuchando). */
  projectPath: string;
  setProjectPath: (p: string) => void;

  /** ¿Hay API key cargada server-side? (espejo del status, no la key). */
  hasKey: boolean;
  setHasKey: (v: boolean) => void;

  messages: ChatMessage[];
  /** True mientras Claude está respondiendo (stream abierto). */
  streaming: boolean;

  /** Plan de cambio vigente → alimenta el grafo. */
  plan: ChangePlan | null;
  /** Diffs propuestos por el último análisis (para revisar/aplicar). */
  diffs: ProposedDiff[];
  /** True mientras se aplican los diffs. */
  applying: boolean;

  /** Card seleccionada (resalta en el grafo + abre código). */
  selectedNodeId: string | null;
  /** Visor de código (o null = cerrado). */
  sourceView: SourceView | null;

  // --- acciones de chat/stream ---
  addUserMessage: (text: string) => string;
  startAssistant: () => string;
  appendAssistantText: (id: string, chunk: string) => void;
  addAssistantStep: (id: string, label: string) => void;
  setStreaming: (v: boolean) => void;

  setPlan: (plan: ChangePlan) => void;
  addDiff: (diff: ProposedDiff) => void;
  clearDiffs: () => void;
  setApplying: (v: boolean) => void;

  selectNode: (id: string | null) => void;
  nodeById: (id: string) => PlanNode | undefined;
  openSource: (v: SourceView) => void;
  closeSource: () => void;

  resetConversation: () => void;
}

let counter = 0;
const nextId = () => `ia-${++counter}`;

export const useIaGrafoStore = create<IaGrafoState>((set, get) => ({
  projectPath: "",
  setProjectPath: (p) => set({ projectPath: p }),

  hasKey: false,
  setHasKey: (v) => set({ hasKey: v }),

  messages: [],
  streaming: false,

  plan: null,
  diffs: [],
  applying: false,

  selectedNodeId: null,
  sourceView: null,

  addUserMessage: (text) => {
    const id = nextId();
    set((s) => ({ messages: [...s.messages, { id, role: "user", text }] }));
    return id;
  },

  startAssistant: () => {
    const id = nextId();
    set((s) => ({
      messages: [...s.messages, { id, role: "assistant", text: "", steps: [] }],
    }));
    return id;
  },

  appendAssistantText: (id, chunk) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, text: m.text + chunk } : m,
      ),
    })),

  addAssistantStep: (id, label) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, steps: [...(m.steps ?? []), label] } : m,
      ),
    })),

  setStreaming: (v) => set({ streaming: v }),

  // Un análisis nuevo reemplaza el plan y limpia los diffs anteriores.
  setPlan: (plan) => set({ plan, diffs: [], selectedNodeId: null }),
  addDiff: (diff) => set((s) => ({ diffs: [...s.diffs, diff] })),
  clearDiffs: () => set({ diffs: [] }),
  setApplying: (v) => set({ applying: v }),

  selectNode: (id) => set({ selectedNodeId: id }),
  nodeById: (id) => get().plan?.nodes.find((n) => n.id === id),
  openSource: (v) => set({ sourceView: v }),
  closeSource: () => set({ sourceView: null }),

  resetConversation: () =>
    set({
      messages: [],
      plan: null,
      diffs: [],
      selectedNodeId: null,
      sourceView: null,
      streaming: false,
    }),
}));
