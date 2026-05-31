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
]);
const MAX_TREE_FILES = 600;
const MAX_RELEVANT_FILES = 8;
const MAX_FILE_BYTES = 24_000;
const MAX_TOTAL_CONTEXT = 120_000;

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
        out.push(path.join(dir, e.name));
      }
    }
  }
  await rec(root);
  return out;
}

/** Palabras y identificadores significativos del pedido (para rankear archivos). */
function keywords(prompt: string): string[] {
  const raw = prompt.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [];
  const stop = new Set([
    "que", "los", "las", "del", "para", "con", "una", "este", "esta", "como",
    "the", "and", "for", "que", "por", "cambiar", "modificar", "quiero", "hacer",
  ]);
  return Array.from(new Set(raw.map((w) => w.toLowerCase()))).filter(
    (w) => !stop.has(w),
  );
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

Reglas: "id" debe ser único y coincidir entre nodes y edges. "oldString" debe ser un fragmento EXACTO y único del archivo (copialo del contexto). No agregues texto fuera del bloque \`\`\`json.`;

/** Arma el prompt completo de modo manual. */
export async function buildManualPrompt(
  projectRoot: string,
  userPrompt: string,
): Promise<string> {
  const root = path.resolve(projectRoot);
  const files = await walkFiles(root);
  const rels = files.map((f) => path.relative(root, f).replace(/\\/g, "/"));

  // Ranking de relevancia por keywords del pedido (en ruta + contenido).
  const kws = keywords(userPrompt);
  const scored: { file: string; rel: string; score: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const rel = rels[i];
    const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
    if (!CODE_EXTS.has(ext)) continue;
    let score = 0;
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
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_RELEVANT_FILES);

  // Bundle de archivos relevantes (capado).
  let total = 0;
  const bundles: string[] = [];
  for (const s of top) {
    try {
      let content = await fs.readFile(s.file, "utf8");
      if (content.length > MAX_FILE_BYTES) {
        content = content.slice(0, MAX_FILE_BYTES) + "\n…(truncado)";
      }
      if (total + content.length > MAX_TOTAL_CONTEXT) break;
      total += content.length;
      bundles.push(`=== ${s.rel} ===\n${content}`);
    } catch {
      /* skip */
    }
  }

  const tree = rels.slice(0, MAX_TREE_FILES).join("\n");
  const relevantNote =
    top.length > 0
      ? top.map((s) => s.rel).join(", ")
      : "(no encontré archivos que matcheen el pedido — guiate por el árbol y pedí en el summary los que falten)";

  return [
    OUTPUT_INSTRUCTIONS,
    `\n# PEDIDO DEL USUARIO\n${userPrompt}`,
    `\n# ÁRBOL DEL PROYECTO (${rels.length} archivos)\n${tree}`,
    `\n# ARCHIVOS RELEVANTES (heurística: ${relevantNote})\n${bundles.join("\n\n")}`,
    `\n# RECORDATORIO\nRespondé SOLO con el bloque \`\`\`json descripto arriba.`,
  ].join("\n");
}
