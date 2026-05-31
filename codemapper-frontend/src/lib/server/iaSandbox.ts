/**
 * IA.Grafo — sandbox de acceso a disco (server-only).
 *
 * Las rutas /api/ia/* leen y (en "Aplicar") escriben archivos del proyecto que
 * el usuario indica con `projectPath`. En un despliegue MULTIUSUARIO eso sería
 * lectura/escritura arbitraria del disco del servidor. Para evitarlo:
 *
 *   - Si `IA_ALLOWED_ROOTS` está seteada (lista de carpetas absolutas separadas
 *     por ';' o ','), TODO projectPath debe vivir dentro de alguna de ellas;
 *     si no, se rechaza con 403. Resolvemos symlinks (realpath) para que no se
 *     pueda escapar del allowlist con un link.
 *   - Si NO está seteada (modo LOCAL / un solo usuario en su máquina), no se
 *     restringe: la app funciona igual que siempre.
 *
 * Para producción: `IA_ALLOWED_ROOTS=/srv/repos` (y opcional `IA_DISABLE_APPLY=1`
 * para prohibir escrituras).
 */
import { promises as fs } from "fs";
import path from "path";

/** Error de autorización: la ruta cae fuera del allowlist. */
export class ForbiddenRootError extends Error {
  constructor(p: string) {
    super(`La ruta del proyecto no está permitida en este servidor: ${p}`);
    this.name = "ForbiddenRootError";
  }
}

function allowedRoots(): string[] {
  const raw = process.env.IA_ALLOWED_ROOTS ?? "";
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
}

/** True cuando el servidor corre en modo multiusuario restringido. */
export function isLockedDown(): boolean {
  return allowedRoots().length > 0;
}

/** True cuando "Aplicar" (escritura a disco) está deshabilitado por config. */
export function isApplyDisabled(): boolean {
  return process.env.IA_DISABLE_APPLY === "1";
}

/**
 * Resuelve `projectRoot` a su ruta real y valida que esté permitido.
 * - Lanza Error genérico si la carpeta no existe.
 * - Lanza ForbiddenRootError si hay allowlist y la ruta no cae dentro.
 * Devuelve la ruta real (con symlinks resueltos).
 */
export async function assertProjectAllowed(projectRoot: string): Promise<string> {
  const resolved = path.resolve(projectRoot);
  let real: string;
  try {
    real = await fs.realpath(resolved);
  } catch {
    throw new Error(`La ruta del proyecto no existe: ${projectRoot}`);
  }
  const roots = allowedRoots();
  if (roots.length === 0) return real; // modo local: sin restricción
  const ok = roots.some((r) => real === r || real.startsWith(r + path.sep));
  if (!ok) throw new ForbiddenRootError(projectRoot);
  return real;
}
