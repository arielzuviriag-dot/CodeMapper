import { NextResponse } from "next/server";
import { buildManualPrompt, buildFollowUpPrompt } from "@/lib/server/iaManual";
import { assertProjectAllowed, ForbiddenRootError } from "@/lib/server/iaSandbox";

export const runtime = "nodejs";

/**
 * Modo manual: arma el prompt autocontenido (con contexto del proyecto) para
 * que el usuario lo pegue en claude.ai. No llama a la API ni necesita key —
 * solo lee archivos locales dentro de projectPath.
 */
export async function POST(req: Request) {
  let body: { projectPath?: string; prompt?: string; followUp?: boolean };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return new NextResponse("Falta el pedido", { status: 400 });

  // Seguimiento en el mismo chat de claude.ai: no re-pegamos el contexto (lo
  // tiene de antes) → prompt liviano, sin leer disco ni validar ruta.
  if (body.followUp) {
    return NextResponse.json({ prompt: buildFollowUpPrompt(prompt) });
  }

  const projectPath = (body.projectPath ?? "").trim();
  if (!projectPath) return new NextResponse("Falta la ruta del proyecto", { status: 400 });

  try {
    await assertProjectAllowed(projectPath);
  } catch (e) {
    if (e instanceof ForbiddenRootError) return new NextResponse(e.message, { status: 403 });
    return new NextResponse((e as Error).message, { status: 400 });
  }

  try {
    const text = await buildManualPrompt(projectPath, prompt);
    return NextResponse.json({ prompt: text });
  } catch (e) {
    return new NextResponse(`No se pudo armar el prompt: ${(e as Error).message}`, {
      status: 500,
    });
  }
}
