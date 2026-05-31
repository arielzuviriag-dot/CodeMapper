/**
 * IA.Grafo — nombre y opciones de la cookie httpOnly donde vive la API key del
 * usuario (server-only). Centralizado para no importar entre archivos de ruta.
 */
export const COOKIE_NAME = "ia_anthropic_key";

export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 días
};
