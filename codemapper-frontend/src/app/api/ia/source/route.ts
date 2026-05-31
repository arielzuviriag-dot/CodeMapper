import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { COOKIE_NAME } from "@/lib/server/iaCookie";

export const runtime = "nodejs";

/** Mapea extensión → lenguaje de Monaco. */
function langFor(file: string): string {
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = {
    java: "java",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    kt: "kotlin",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    properties: "ini",
    sql: "sql",
    html: "html",
    css: "css",
    py: "python",
    md: "markdown",
  };
  return map[ext] ?? "plaintext";
}

/**
 * Lee un archivo del proyecto (sandbox dentro de projectPath) para el visor de
 * código de IA.Grafo. Sirve cualquier tipo de archivo, no solo Java.
 */
export async function POST(req: Request) {
  const store = await cookies();
  if (!store.get(COOKIE_NAME)?.value) {
    return new NextResponse("Falta la API key", { status: 401 });
  }
  let body: { projectPath?: string; file?: string };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }
  const projectPath = (body.projectPath ?? "").trim();
  const file = (body.file ?? "").trim();
  if (!projectPath || !file) {
    return new NextResponse("Faltan projectPath/file", { status: 400 });
  }

  const root = path.resolve(projectPath);
  const abs = path.isAbsolute(file) ? path.normalize(file) : path.resolve(root, file);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return new NextResponse("Ruta fuera del proyecto", { status: 403 });
  }
  try {
    const source = await fs.readFile(abs, "utf8");
    return NextResponse.json({
      source,
      path: abs,
      language: langFor(file),
    });
  } catch (e) {
    return new NextResponse(`No se pudo leer el archivo: ${(e as Error).message}`, {
      status: 404,
    });
  }
}
