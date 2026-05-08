/**
 * Single source of truth for "what feature lights up at which Java version".
 * Used by JavaVersionBadge to render the educational popover, AND mirrors
 * the compatibility table in PLAN_FOCO_DIMENSIONES.md so backend extractors
 * and frontend renderers agree on what to surface.
 */

export interface JavaFeature {
  /** Short label shown in the popover list. */
  label: string;
  /** One-line explanation of what the dev gets when this feature lights up. */
  description: string;
  /** Major Java version the feature first becomes meaningful at. */
  minVersion: number;
}

/**
 * Ordered by minVersion ascending so "Lo que ves ahora" reads top-to-bottom
 * as the dev's project ages from older to newer Java releases.
 */
export const JAVA_FEATURES: JavaFeature[] = [
  {
    label: "Excepciones declaradas (throws)",
    description: "Cluster con todas las excepciones que la clase puede lanzar.",
    minVersion: 1,
  },
  {
    label: "Anotaciones de framework",
    description:
      "@Service, @Transactional, @Cacheable, @Async y demás se detectan y muestran como chips.",
    minVersion: 5,
  },
  {
    label: "Anotaciones de seguridad",
    description:
      "@PreAuthorize, @Secured, @RolesAllowed marcan métodos protegidos con un escudo dorado.",
    minVersion: 5,
  },
  {
    label: "Default methods en interfaces",
    description:
      "Los métodos con cuerpo en interfaces se distinguen del contrato puro.",
    minVersion: 8,
  },
  {
    label: "Lambdas y streams en cuerpos",
    description:
      "El parser entiende código funcional al resolver llamadas y dependencias.",
    minVersion: 8,
  },
  {
    label: "Records (componentes en lugar de fields)",
    description:
      "Los records muestran sus componentes posicionales en vez del listado de fields tradicional.",
    minVersion: 14,
  },
  {
    label: "Sealed classes (permits)",
    description:
      "Las clases sealed declaran qué subclases permiten — se renderiza la lista de permits.",
    minVersion: 17,
  },
  {
    label: "Pattern matching avanzado",
    description:
      "switch con patterns, record patterns y deconstrucción se parsean sin caerse.",
    minVersion: 21,
  },
];

/** "17" → 17, "1.8" → 8, null/garbage → null. */
export function parseJavaMajor(version: string | null | undefined): number | null {
  if (!version) return null;
  const trimmed = version.trim();
  // "1.8" legacy → 8 (the backend already normalizes this, but defending here too).
  const normalized = trimmed.startsWith("1.") ? trimmed.slice(2) : trimmed;
  const n = parseInt(normalized, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Features the project can already use given the detected version. When the
 *  version is null/unknown, returns an empty list — caller should fall back
 *  to "showing everything supported" instead. */
export function featuresAvailable(detected: string | null | undefined): JavaFeature[] {
  const major = parseJavaMajor(detected);
  if (major === null) return [];
  return JAVA_FEATURES.filter((f) => f.minVersion <= major);
}

/** Features the project would unlock by upgrading. Empty when the project is
 *  already on the latest known feature, or when version is unknown (we show
 *  the full list as "everything supported" in that case). */
export function featuresLockedBehind(detected: string | null | undefined): JavaFeature[] {
  const major = parseJavaMajor(detected);
  if (major === null) return [];
  return JAVA_FEATURES.filter((f) => f.minVersion > major);
}
