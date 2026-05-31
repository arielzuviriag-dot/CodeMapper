import { NextResponse } from "next/server";
import { applyProposedDiffs } from "@/lib/server/iaAgent";
import type { ProposedDiff } from "@/lib/iaGrafo";
import {
  assertProjectAllowed,
  ForbiddenRootError,
  isApplyDisabled,
} from "@/lib/server/iaSandbox";

export const runtime = "nodejs";

/**
 * Aplica los diffs propuestos al working tree del proyecto, de forma
 * determinista (search/replace exacto), sin volver a llamar a Claude. Funciona
 * tanto en modo API como manual; la protección real es el sandbox por
 * projectPath en applyProposedDiffs (anti path-traversal).
 */
export async function POST(req: Request) {
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

  if (isApplyDisabled()) {
    return new NextResponse("Aplicar cambios está deshabilitado en este servidor", {
      status: 403,
    });
  }
  try {
    await assertProjectAllowed(projectPath);
  } catch (e) {
    if (e instanceof ForbiddenRootError) return new NextResponse(e.message, { status: 403 });
    return new NextResponse((e as Error).message, { status: 400 });
  }

  const result = await applyProposedDiffs(projectPath, diffs);
  return NextResponse.json(result);
}
