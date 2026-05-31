import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { buildManualPrompt } from "@/lib/server/iaManual";

export const runtime = "nodejs";

/**
 * Modo manual: arma el prompt autocontenido (con contexto del proyecto) para
 * que el usuario lo pegue en claude.ai. No llama a la API ni necesita key —
 * solo lee archivos locales dentro de projectPath.
 */
export async function POST(req: Request) {
  let body: { projectPath?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }
  const projectPath = (body.projectPath ?? "").trim();
  const prompt = (body.prompt ?? "").trim();
  if (!projectPath) return new NextResponse("Falta la ruta del proyecto", { status: 400 });
  if (!prompt) return new NextResponse("Falta el pedido", { status: 400 });

  const stat = await fs.stat(path.resolve(projectPath)).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    return new NextResponse(`La ruta del proyecto no existe: ${projectPath}`, { status: 400 });
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
