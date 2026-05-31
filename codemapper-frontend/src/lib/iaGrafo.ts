/**
 * IA.Grafo — tipos y cliente del front para la feature de chat con Claude que
 * devuelve un "plan de cambio" como grafo (qué toca y por qué) + diffs aplicables.
 *
 * Toda la comunicación con Claude pasa por rutas server de Next.js
 * (`/api/ia/*`): la API key del usuario vive server-side (cookie httpOnly) y
 * NUNCA llega al browser. Acá solo definimos el contrato y los helpers de fetch.
 */

/** Rol de cada card en el plan — define el color/ícono en el grafo. */
export type PlanNodeRole =
  | "objetivo" // la clase/archivo central del cambio
  | "caller" // la llama / depende de ella → hay que tocarla
  | "dependencia" // a quién llama el objetivo
  | "test" // test afectado
  | "config"; // archivo de configuración afectado

export interface PlanNode {
  /** Id estable: FQCN si es Java, si no la ruta relativa del archivo. */
  id: string;
  /** Nombre corto a mostrar en la card. */
  label: string;
  role: PlanNodeRole;
  /** Ruta del archivo (relativa al proyecto) para abrir el código. */
  file?: string;
  /** FQCN cuando es una clase Java (para resolver la fuente vía backend). */
  fqcn?: string;
  /** Línea a la que saltar al abrir el código (1-based). */
  anchorLine?: number;
  /** Método/símbolo del cambio (fallback para ubicar la línea). */
  anchorSymbol?: string;
  /** Qué cambia puntualmente acá. */
  summary?: string;
}

export interface PlanEdge {
  from: string;
  to: string;
  /** La leyenda del "por qué toca ahí" — se muestra sobre la arista. */
  reason: string;
  /** Tipo de toque: "rename-llamada", "nueva-firma", "import", etc. */
  changeKind?: string;
}

export interface ChangePlan {
  /** Resumen humano del impacto del cambio. */
  summary: string;
  nodes: PlanNode[];
  edges: PlanEdge[];
}

/** Cambio concreto propuesto (search/replace) — se aplica de forma determinista. */
export interface ProposedDiff {
  /** Ruta relativa al proyecto. */
  file: string;
  /** Por qué este cambio. */
  reason: string;
  /** Texto exacto a reemplazar (debe existir tal cual en el archivo). */
  oldString: string;
  /** Texto nuevo. */
  newString: string;
}

/** Mensaje del chat (en el store del front). */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Pasos de herramienta que Claude fue ejecutando (para mostrar progreso). */
  steps?: string[];
}

/* ============================================================
 * Protocolo de streaming (NDJSON, una línea por evento) entre
 * /api/ia/chat y el cliente.
 * ============================================================ */
export type IaStreamEvent =
  | { type: "text"; text: string }
  | { type: "step"; label: string }
  | { type: "plan"; plan: ChangePlan }
  | { type: "diff"; diff: ProposedDiff }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ChatRequest {
  /** Ruta absoluta del proyecto a analizar (mismo concepto que backendPath). */
  projectPath: string;
  /** El pedido del usuario en lenguaje natural. */
  prompt: string;
  /** Historial previo (para multi-turno). */
  history?: { role: "user" | "assistant"; text: string }[];
}

/* ============================================================ */

/** Estado de la API key (sin exponer la key real). */
export async function getKeyStatus(): Promise<{ hasKey: boolean }> {
  const res = await fetch("/api/ia/key", { method: "GET" });
  if (!res.ok) return { hasKey: false };
  return res.json();
}

export async function setApiKey(key: string): Promise<boolean> {
  const res = await fetch("/api/ia/key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  return res.ok;
}

export async function clearApiKey(): Promise<void> {
  await fetch("/api/ia/key", { method: "DELETE" });
}

/**
 * Abre el stream del chat y entrega cada evento al callback `onEvent`.
 * Resuelve cuando el stream termina. Lanza si la conexión falla.
 */
export async function streamChat(
  req: ChatRequest,
  onEvent: (ev: IaStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ia/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (res.status === 401) {
    onEvent({ type: "error", message: "Falta la API key. Conectá tu cuenta primero." });
    return;
  }
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "");
    onEvent({ type: "error", message: msg || `Error ${res.status} del servidor IA` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as IaStreamEvent);
      } catch {
        // línea parcial/ruido — ignorar
      }
    }
  }
}

/** Lee el código fuente de un archivo del proyecto (cualquier tipo). */
export async function fetchSource(
  projectPath: string,
  file: string,
): Promise<{ source: string; path: string; language: string }> {
  const res = await fetch("/api/ia/source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, file }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Error ${res.status} al leer el archivo`);
  }
  return res.json();
}

/** Aplica los diffs propuestos al working tree del proyecto. */
export async function applyDiffs(
  projectPath: string,
  diffs: ProposedDiff[],
): Promise<{ applied: number; failures: { file: string; error: string }[] }> {
  const res = await fetch("/api/ia/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, diffs }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Error ${res.status} al aplicar`);
  }
  return res.json();
}
