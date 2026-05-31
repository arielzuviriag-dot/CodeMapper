import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { runAgent, type AgentEmit } from "@/lib/server/iaAgent";
import { COOKIE_NAME } from "@/lib/server/iaCookie";

export const runtime = "nodejs";
// El análisis agéntico puede tardar; subimos el límite de la función.
export const maxDuration = 300;

/**
 * Chat de IA.Grafo. Lee la API key de la cookie httpOnly, corre el loop
 * agéntico contra el proyecto indicado y streamea los eventos como NDJSON
 * (una línea JSON por evento). Ver `IaStreamEvent` en lib/iaGrafo.ts.
 */
export async function POST(req: Request) {
  const store = await cookies();
  const apiKey = store.get(COOKIE_NAME)?.value;
  if (!apiKey) {
    return new NextResponse("Falta la API key", { status: 401 });
  }

  let body: { projectPath?: string; prompt?: string; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }

  const projectPath = (body.projectPath ?? "").trim();
  const prompt = (body.prompt ?? "").trim();
  if (!projectPath) return new NextResponse("Falta la ruta del proyecto", { status: 400 });
  if (!prompt) return new NextResponse("Falta el pedido", { status: 400 });

  const history = Array.isArray(body.history)
    ? (body.history as { role: "user" | "assistant"; text: string }[]).filter(
        (h) => (h.role === "user" || h.role === "assistant") && typeof h.text === "string",
      )
    : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: AgentEmit) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          // controller cerrado (cliente abortó) — ignorar
        }
      };
      await runAgent(apiKey, projectPath, prompt, history, emit, req.signal);
      try {
        controller.close();
      } catch {
        /* ya cerrado */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
