import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyProposedDiffs } from "@/lib/server/iaAgent";
import type { ProposedDiff } from "@/lib/iaGrafo";
import { COOKIE_NAME } from "@/lib/server/iaCookie";

export const runtime = "nodejs";

/**
 * Aplica los diffs propuestos al working tree del proyecto, de forma
 * determinista (search/replace exacto), sin volver a llamar a Claude.
 * Requiere key cargada (mismo gate que el chat) para no exponer escritura
 * arbitraria de archivos sin autenticación.
 */
export async function POST(req: Request) {
  const store = await cookies();
  if (!store.get(COOKIE_NAME)?.value) {
    return new NextResponse("Falta la API key", { status: 401 });
  }

  let body: { projectPath?: string; diffs?: ProposedDiff[] };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }
  const projectPath = (body.projectPath ?? "").trim();
  const diffs = Array.isArray(body.diffs) ? body.diffs : [];
  if (!projectPath) return new NextResponse("Falta la ruta del proyecto", { status: 400 });
  if (diffs.length === 0) return new NextResponse("No hay cambios para aplicar", { status: 400 });

  const result = await applyProposedDiffs(projectPath, diffs);
  return NextResponse.json(result);
}
