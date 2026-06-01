/**
 * IA.Grafo — modo MANUAL (copiar/pegar), server-only.
 *
 * En vez de llamar a la API, armamos UN prompt autocontenido (instrucciones +
 * formato de salida + árbol del proyecto + archivos relevantes + pedido) que el
 * usuario pega en claude.ai (su suscripción, sin costo de API ni problema de
 * ToS: es un humano usándolo). La respuesta de Claude la parsea el front.
 *
 * A diferencia del modo agéntico, acá no hay ida y vuelta de herramientas: el
 * contexto se junta de una. Por eso elegimos los archivos relevantes con una
 * heurística (grep por las palabras del pedido) y capamos el tamaño.
 */
import { promises as fs } from "fs";
import path from "path";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "target",
  "build",
  "dist",
  ".next",
  ".idea",
  "out",
  "bin",
  // Ruido que infla el árbol sin aportar al análisis (ahorro de tokens).
  ".gradle",
  ".mvn",
  "uploads",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  ".cache",
  "logs",
]);

/** Extensiones que NO van al árbol: binarios/medios/locks → puro peso de tokens. */
const NON_TEXT_EXTS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "svg", "ico", "bmp", "avif",
  "pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt",
  "jar", "war", "zip", "tar", "gz", "rar", "7z", "class", "exe", "dll", "so", "bin",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp4", "mov", "avi", "mp3", "wav", "ogg",
  "lock",
]);
const CODE_EXTS = new Set([
  "java",
  "kt",
  "ts",
  "tsx",
  "js",
  "jsx",
  "xml",
  "properties",
  "yml",
  "yaml",
  "sql",
  // web / estilos — clave para pedidos de UI (fondo, color, layout, etc.)
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "htm",
  "vue",
  "svelte",
  "json",
]);
const MAX_TREE_FILES = 600;
const MAX_RELEVANT_FILES = 8;
const MAX_FILE_BYTES = 18_000;
const MAX_TOTAL_CONTEXT = 80_000;

function extOf(p: string): string {
  return p.slice(p.lastIndexOf(".") + 1).toLowerCase();
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function rec(dir: string): Promise<void> {
    if (out.length >= MAX_TREE_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_TREE_FILES) return;
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        await rec(path.join(dir, e.name));
      } else {
        // Saltar binarios/medios/locks: no aportan al análisis y cuestan tokens.
        if (NON_TEXT_EXTS.has(extOf(e.name))) continue;
        out.push(path.join(dir, e.name));
      }
    }
  }
  await rec(root);
  return out;
}

/**
 * Resumen "skim" de un archivo de apoyo (no el target del cambio): solo imports
 * / firmas / declaraciones (o selectores y variables si es CSS). Le da a Claude
 * la FORMA del archivo sin el cuerpo entero → ahorro fuerte de tokens. Los
 * archivos top (donde cae el cambio) van completos aparte.
 */
function compactFile(rel: string, content: string): string {
  const ext = extOf(rel);
  const isStyle = ["css", "scss", "sass", "less"].includes(ext);
  const keep: string[] = [];
  for (const ln of content.split("\n")) {
    const t = ln.trim();
    if (!t) continue;
    let take: boolean;
    if (isStyle) {
      take = t.endsWith("{") || t.startsWith("--") || t.startsWith("@") || t.startsWith("/*");
    } else {
      take =
        /^(import |export |class |interface |type |enum |function |async function |abstract |public |private |protected |@[A-Za-z])/.test(
          t,
        ) ||
        /^(export\s+)?const\s+[A-Za-z0-9_]+\s*[=:]/.test(t) ||
        (/=>\s*\{?\s*$/.test(t) && t.length < 120);
    }
    if (take) keep.push(ln.length > 160 ? ln.slice(0, 160) + "…" : ln);
    if (keep.length >= 50) {
      keep.push("  …");
      break;
    }
  }
  return keep.length ? keep.join("\n") : content.slice(0, 1200);
}

/** El pedido es sobre apariencia/UI (fondo, color, estilo, layout, tema…). */
const STYLE_INTENT =
  /(fondo|background|\bbg\b|colou?r|estilo|style|css|tema|theme|dise[ñn]o|tailwind|dark|light|tipograf|font|margin|padding|layout|\bclase\b|\bclass\b|ui)/i;

/** Palabras e identificadores del pedido (para rankear archivos). Separa
 *  CamelCase (DashboardPage → dashboard, page) y, si el pedido es de estilo,
 *  agrega términos típicos de CSS/theme que el usuario no escribe pero el
 *  archivo sí contiene (background, theme, body, root…). */
function keywords(prompt: string): string[] {
  const raw = prompt.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [];
  const expanded: string[] = [];
  for (const w of raw) {
    expanded.push(w);
    const parts = w.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/);
    if (parts.length > 1) expanded.push(...parts);
  }
  const stop = new Set([
    "que", "los", "las", "del", "para", "con", "una", "este", "esta", "como",
    "the", "and", "for", "por", "cambiar", "modificar", "quiero", "hacer", "poner",
  ]);
  const out = new Set(
    expanded.map((w) => w.toLowerCase()).filter((w) => w.length >= 3 && !stop.has(w)),
  );
  if (STYLE_INTENT.test(prompt)) {
    ["background", "color", "theme", "style", "css", "class", "body", "root", "bg"].forEach(
      (t) => out.add(t),
    );
  }
  return Array.from(out);
}

/**
 * Boost para "anclas estructurales": archivos que casi siempre importan para un
 * cambio aunque NO matcheen por palabra — la raíz/layout de la app, los estilos
 * globales / theme, y la config. Sin esto, un "pintá la home de verde" nunca
 * traería theme/index.css ni Layout.tsx.
 */
function anchorBoost(rel: string, styleIntent: boolean): number {
  const base = rel.toLowerCase();
  const name = base.slice(base.lastIndexOf("/") + 1);
  let s = 0;
  if (/^(layout|app|_app|main|root)\.(tsx|ts|jsx|js)$/.test(name)) s += 4;
  const isStyle = /\.(css|scss|sass|less)$/.test(name);
  const themeish =
    /(global|index|app|main|theme|style|variable|token|base|reset)/.test(name) ||
    /(^|\/)(theme|themes|styles?|css|scss)\//.test(base);
  if (isStyle && themeish) s += styleIntent ? 6 : 3;
  else if (isStyle && styleIntent) s += 3;
  if (
    /^(package\.json|tailwind\.config\.(js|ts|cjs|mjs)|postcss\.config\.(js|cjs|mjs)|next\.config\.(js|ts|mjs)|application\.(yml|yaml|properties))$/.test(
      name,
    )
  ) {
    s += 2;
  }
  return s;
}

const OUTPUT_INSTRUCTIONS = `Sos el motor de análisis de "IA.Grafo": visualizás el impacto de un cambio de código.

Con el PEDIDO del usuario y el CONTEXTO del proyecto que está más abajo, encontrá TODOS los lugares que el cambio tocaría. No tenés herramientas: basate solo en el contexto provisto (si falta un archivo clave, decilo en el summary).

Respondé EXCLUSIVAMENTE con UN bloque de código \`\`\`json con esta forma exacta:

\`\`\`json
{
  "summary": "resumen humano del impacto",
  "nodes": [
    { "id": "FQCN-o-ruta", "label": "NombreCorto", "role": "objetivo|caller|dependencia|test|config",
      "file": "ruta/relativa.java", "fqcn": "com.x.Clase", "anchorLine": 42, "anchorSymbol": "metodo", "summary": "qué cambia acá" }
  ],
  "edges": [
    { "from": "id-origen", "to": "id-destino", "reason": "por qué se toca ahí (corto y concreto)", "changeKind": "rename-llamada" }
  ],
  "diffs": [
    { "file": "ruta/relativa.java", "reason": "por qué", "oldString": "texto EXACTO que existe hoy", "newString": "reemplazo" }
  ]
}
\`\`\`

Reglas: "id" debe ser único y coincidir entre nodes y edges. "oldString" debe ser un fragmento EXACTO y único del archivo (copialo del contexto). El bloque \`\`\`json debe ser lo único que la app parsea. Algunos archivos del contexto vienen como RESUMEN (solo firmas/selectores, marcados "(resumen: …)"): NO inventes su contenido — si necesitás el texto exacto de uno resumido para un diff, dejá ese diff afuera y pedí el archivo completo en el summary.

DESPUÉS del bloque \`\`\`json (y solo después, en una línea aparte), agregá EXACTAMENTE:
Tokens aprox. de esta respuesta: <número>
con tu mejor estimación de cuántos tokens ocupó tu respuesta. Esa línea NO va dentro del JSON.`;

/** Arma el prompt completo de modo manual. */
/**
 * Construye SOLO el contexto del proyecto (árbol scoped + archivos relevantes,
 * con los de apoyo resumidos). Es la "investigación" determinística que hace la
 * herramienta — la comparte el modo manual y el modo API (donde va cacheado).
 */
export async function buildProjectContext(
  projectRoot: string,
  userPrompt: string,
): Promise<string> {
  const root = path.resolve(projectRoot);
  const files = await walkFiles(root);
  const rels = files.map((f) => path.relative(root, f).replace(/\\/g, "/"));

  // Ranking de relevancia: keywords del pedido (ruta + contenido) + anclas
  // estructurales (layout/theme/global CSS/config) según la intención.
  const kws = keywords(userPrompt);
  const styleIntent = STYLE_INTENT.test(userPrompt);
  const scored: { file: string; rel: string; score: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const rel = rels[i];
    const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
    if (!CODE_EXTS.has(ext)) continue;
    let score = anchorBoost(rel, styleIntent);
    const relLower = rel.toLowerCase();
    for (const k of kws) if (relLower.includes(k)) score += 3;
    let content = "";
    try {
      const stat = await fs.stat(files[i]);
      if (stat.size <= MAX_FILE_BYTES * 3) content = await fs.readFile(files[i], "utf8");
    } catch {
      /* skip */
    }
    if (content) {
      const cl = content.toLowerCase();
      for (const k of kws) if (cl.includes(k)) score += 1;
    }
    if (score > 0) scored.push({ file: files[i], rel, score });
  }
  // Si el pedido NOMBRA un módulo (carpeta top-level), acotamos duro a él. Para
  // monorepos con prefijo común (plixe-admin / plixe-mobile / plixe-backend),
  // ignoramos el segmento compartido ("plixe") y matcheamos por el distintivo
  // ("admin"). Así "fondo de plixe admin" no arrastra mobile ni backend.
  const topDirs = Array.from(
    new Set(rels.filter((r) => r.includes("/")).map((r) => r.split("/")[0])),
  );
  const segFreq = new Map<string, number>();
  for (const d of topDirs)
    for (const s of d.toLowerCase().split(/[-_.]/))
      segFreq.set(s, (segFreq.get(s) ?? 0) + 1);
  const pl = userPrompt.toLowerCase();
  const namedModules = topDirs.filter((d) => {
    if (pl.includes(d.toLowerCase())) return true;
    return d
      .toLowerCase()
      .split(/[-_.]/)
      .some((s) => s.length >= 4 && segFreq.get(s) === 1 && pl.includes(s));
  });

  let pool = scored;
  if (namedModules.length > 0) {
    const set = new Set(namedModules);
    const filtered = scored.filter((s) => set.has(s.rel.split("/")[0]));
    if (filtered.length > 0) pool = filtered;
  }
  pool.sort((a, b) => b.score - a.score);
  const top = pool.slice(0, MAX_RELEVANT_FILES);

  // Bundle: los TOP (donde cae el cambio) completos para que el oldString sea
  // exacto; el resto como resumen de firmas/selectores (ahorro de tokens).
  const FULL_BUNDLE = 4;
  let total = 0;
  const bundles: string[] = [];
  for (let i = 0; i < top.length; i++) {
    const s = top[i];
    try {
      const raw = await fs.readFile(s.file, "utf8");
      let content: string;
      let label: string;
      if (i < FULL_BUNDLE) {
        content =
          raw.length > MAX_FILE_BYTES ? raw.slice(0, MAX_FILE_BYTES) + "\n…(truncado)" : raw;
        label = `=== ${s.rel} ===`;
      } else {
        content = compactFile(s.rel, raw);
        label = `=== ${s.rel} (resumen: firmas/selectores) ===`;
      }
      if (total + content.length > MAX_TOTAL_CONTEXT) break;
      total += content.length;
      bundles.push(`${label}\n${content}`);
    } catch {
      /* skip */
    }
  }

  // Acotar el ÁRBOL a los módulos donde realmente cae el cambio (top-level dir
  // de los archivos relevantes). Si el pedido es de plixe-admin, NO mandamos
  // todo plixe-backend → el mayor ahorro de tokens. Sin relevantes, va todo.
  const TREE_CAP = 250;
  const relevantModules = new Set<string>();
  for (const s of top) {
    relevantModules.add(s.rel.includes("/") ? s.rel.split("/")[0] : "");
  }
  const treeRels =
    relevantModules.size > 0
      ? rels.filter((r) =>
          relevantModules.has(r.includes("/") ? r.split("/")[0] : ""),
        )
      : rels;
  const scopedAway = rels.length - treeRels.length;
  const tree = treeRels.slice(0, TREE_CAP).join("\n");
  const treeNote =
    relevantModules.size > 0 && scopedAway > 0
      ? `acotado a [${Array.from(relevantModules)
          .map((m) => m || "(raíz)")
          .join(", ")}] — se omitieron ${scopedAway} archivos de otros módulos`
      : `${treeRels.length} archivos`;
  const relevantNote =
    top.length > 0
      ? top.map((s) => s.rel).join(", ")
      : "(no encontré archivos que matcheen el pedido — guiate por el árbol y pedí en el summary los que falten)";

  return [
    `# ÁRBOL DEL PROYECTO (${treeNote})\n${tree}`,
    `# ARCHIVOS RELEVANTES (heurística: ${relevantNote})\n${bundles.join("\n\n")}`,
  ].join("\n\n");
}

/** Prompt completo de modo manual = instrucciones + pedido + contexto. */
export async function buildManualPrompt(
  projectRoot: string,
  userPrompt: string,
): Promise<string> {
  const context = await buildProjectContext(projectRoot, userPrompt);
  return [
    OUTPUT_INSTRUCTIONS,
    `\n# PEDIDO DEL USUARIO\n${userPrompt}`,
    `\n${context}`,
    `\n# RECORDATORIO\nRespondé SOLO con el bloque \`\`\`json descripto arriba.`,
  ].join("\n");
}

/**
 * Prompt de SEGUIMIENTO: para cuando seguís en el MISMO chat de claude.ai, que
 * ya tiene el proyecto del primer mensaje. No re-pega el contexto (árbol +
 * archivos) → cuesta una fracción de tokens. Solo el pedido nuevo + un
 * recordatorio compacto del formato.
 */
export function buildFollowUpPrompt(userPrompt: string): string {
  return [
    "Seguimos con el MISMO proyecto que ya te pasé antes en este chat (no lo vuelvo a pegar, para ahorrar tokens). Si te falta el contenido exacto de algún archivo para un diff, pedímelo en el summary.",
    'Respondé EN EL MISMO FORMATO: UN bloque ```json con { "summary", "nodes":[{id,label,role,file,fqcn,anchorLine,anchorSymbol,summary}], "edges":[{from,to,reason,changeKind}], "diffs":[{file,reason,oldString,newString}] } (ids únicos; oldString EXACTO). Después del bloque, una línea: "Tokens aprox. de esta respuesta: <número>".',
    `\n# NUEVO PEDIDO\n${userPrompt}`,
  ].join("\n\n");
}
