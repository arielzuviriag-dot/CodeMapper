import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, COOKIE_OPTS } from "@/lib/server/iaCookie";

export const runtime = "nodejs";

/**
 * Gestión de la API key de Anthropic del usuario.
 *
 * La key se guarda en una cookie **httpOnly** (no accesible desde JS del
 * browser) y solo viaja a nuestras rutas server, que la usan para hablar con
 * Claude. NUNCA se devuelve al cliente: GET solo informa si existe.
 *
 * Nota de seguridad: para un despliegue multiusuario en la empresa conviene
 * cifrar en reposo y/o mover a un store server-side por sesión. Para uso local
 * la cookie httpOnly alcanza.
 */

export async function GET() {
  const store = await cookies();
  const key = store.get(COOKIE_NAME)?.value;
  return NextResponse.json({ hasKey: !!key && key.length > 0 });
}

export async function POST(req: Request) {
  let key: unknown;
  try {
    ({ key } = await req.json());
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }
  if (typeof key !== "string" || key.trim().length < 10) {
    return new NextResponse("API key inválida", { status: 400 });
  }
  // Validación de forma básica: las keys de Anthropic empiezan con "sk-ant-".
  const trimmed = key.trim();
  if (!trimmed.startsWith("sk-ant-")) {
    return new NextResponse(
      "Eso no parece una API key de Anthropic (debería empezar con sk-ant-)",
      { status: 400 },
    );
  }
  const store = await cookies();
  store.set(COOKIE_NAME, trimmed, COOKIE_OPTS);
  return NextResponse.json({ hasKey: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
  return NextResponse.json({ hasKey: false });
}
