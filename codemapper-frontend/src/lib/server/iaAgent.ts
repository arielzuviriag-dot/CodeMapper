/**
 * IA.Grafo — orquestador server-side (solo Node).
 *
 * Implementa un loop agéntico con tool-use sobre el SDK oficial de Anthropic
 * (@anthropic-ai/sdk). Claude explora el proyecto con herramientas ANCLADAS al
 * filesystem real (read_file / list_dir / grep) — por eso el grafo no alucina:
 * cada nodo/arista que reporta nace de algo que leyó de verdad. Al final llama
 * a `report_plan` (el grafo) y a `propose_diff` (los cambios concretos, que se
 * aplican después de forma determinista, nunca acá).
 *
 * Seguridad: TODA ruta que pida una herramienta se resuelve y se valida que
 * caiga dentro de `projectRoot` (anti path-traversal).
 */
import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import path from "path";
import type { ChangePlan, ProposedDiff } from "@/lib/iaGrafo";
import { buildProjectContext } from "./iaManual";

const MODEL = process.env.IA_GRAFO_MODEL ?? "claude-opus-4-8";
const MAX_TURNS = 28;
const MAX_FILE_BYTES = 200_000;
const MAX_GREP_MATCHES = 80;
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

/** Eventos que el agente emite hacia el stream del cliente. */
export type AgentEmit =
  | { type: "text"; text: string }
  | { type: "step"; label: string }
  | { type: "plan"; plan: ChangePlan }
  | { type: "diff"; diff: ProposedDiff }
  | { type: "done" }
  | { type: "error"; message: string };

/** Resuelve `p` (relativo o absoluto) dentro de root; lanza si se escapa. */
function safeResolve(root: string, p: string): string {
  const abs = path.isAbsolute(p) ? path.normalize(p) : path.resolve(root, p);
  const normRoot = path.resolve(root);
  if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
    throw new Error(`Ruta fuera del proyecto: ${p}`);
  }
  return abs;
}

async function readFileTool(root: string, rel: string): Promise<string> {
  const abs = safeResolve(root, rel);
  const stat = await fs.stat(abs);
  if (stat.size > MAX_FILE_BYTES) {
    const buf = await fs.readFile(abs, "utf8");
    return (
      buf.slice(0, MAX_FILE_BYTES) +
      `\n\n…(archivo truncado en ${MAX_FILE_BYTES} bytes de ${stat.size})`
    );
  }
  return fs.readFile(abs, "utf8");
}

async function listDirTool(root: string, rel: string): Promise<string> {
  const abs = safeResolve(root, rel || ".");
  const entries = await fs.readdir(abs, { withFileTypes: true });
  return entries
    .filter((e) => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .join("\n");
}

async function grepTool(
  root: string,
  pattern: string,
  globExt?: string,
): Promise<string> {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return `patrón regex inválido: ${pattern}`;
  }
  const ext = globExt?.replace(/^\*?\./, "").toLowerCase();
  const matches: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (matches.length >= MAX_GREP_MATCHES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (matches.length >= MAX_GREP_MATCHES) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        await walk(full);
      } else {
        if (ext && !e.name.toLowerCase().endsWith("." + ext)) continue;
        let content: string;
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          content = await fs.readFile(full, "utf8");
        } catch {
          continue;
        }
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            const relPath = path.relative(root, full).replace(/\\/g, "/");
            matches.push(`${relPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
            if (matches.length >= MAX_GREP_MATCHES) break;
          }
        }
      }
    }
  }

  await walk(path.resolve(root));
  if (matches.length === 0) return "(sin coincidencias)";
  const capped = matches.length >= MAX_GREP_MATCHES ? "\n…(resultados truncados)" : "";
  return matches.join("\n") + capped;
}

const SYSTEM_PROMPT = `Sos el motor de análisis de "IA.Grafo", una herramienta que visualiza el impacto de un cambio de código sobre un proyecto (mayormente Java/Spring, pero puede haber front).

El usuario te pide un cambio en lenguaje natural ("quiero modificar X"). Tu trabajo:
1. ABAJO, en el system, tenés YA el CONTEXTO del proyecto pre-investigado por la herramienta: el árbol (acotado al módulo del cambio) y los archivos relevantes (los del cambio completos; los de apoyo resumidos). Basate en ESO. Usá las herramientas (read_file/grep/list_dir) SOLO si te falta un archivo puntual o necesitás el texto exacto de uno que vino resumido — NO re-explores lo que ya tenés (ahorra tokens). No inventes: cada lugar que reportes tiene que salir del contexto o de algo que leíste.
2. Llamar UNA vez a "report_plan" con el grafo del impacto:
   - nodos: cada archivo/clase afectada, con su rol (objetivo / caller / dependencia / test / config), su file (ruta relativa), fqcn si es Java, y anchorLine (la línea exacta del cambio) + anchorSymbol (método).
   - aristas: una por relación entre nodos, con "reason" = explicación CORTA y concreta de por qué se toca ahí (ej: "Llama a getTotal() en la línea 88, hay que actualizar el nombre"). El reason es la leyenda que el usuario va a leer sobre la flecha.
3. Llamar a "propose_diff" por CADA cambio concreto (search/replace exacto): file (ruta relativa), reason, oldString (texto EXACTO que existe hoy, con suficiente contexto para ser único), newString (el reemplazo). NO apliques nada — solo proponés.
4. Responder en español, breve, explicando el plan.

Reglas:
- oldString debe ser un fragmento EXACTO y único del archivo (copialo de read_file). Si no estás seguro, leé el archivo primero.
- Si el pedido es ambiguo, hacé tu mejor interpretación y aclarala en el texto.
- Preferí cambios mínimos y seguros.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Lee el contenido de un archivo del proyecto (ruta relativa al proyecto).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "ruta relativa" } },
      required: ["path"],
    },
  },
  {
    name: "list_dir",
    description: "Lista los archivos/carpetas de un directorio del proyecto.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "ruta relativa (vacío = raíz)" } },
      required: ["path"],
    },
  },
  {
    name: "grep",
    description: "Busca un patrón (regex) en los archivos del proyecto. Devuelve file:line: texto.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "regex a buscar" },
        ext: { type: "string", description: "extensión opcional para filtrar (ej: java)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "report_plan",
    description: "Reporta el grafo de impacto del cambio (una sola vez).",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              role: { type: "string", enum: ["objetivo", "caller", "dependencia", "test", "config"] },
              file: { type: "string" },
              fqcn: { type: "string" },
              anchorLine: { type: "number" },
              anchorSymbol: { type: "string" },
              summary: { type: "string" },
            },
            required: ["id", "label", "role"],
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              reason: { type: "string" },
              changeKind: { type: "string" },
            },
            required: ["from", "to", "reason"],
          },
        },
      },
      required: ["summary", "nodes", "edges"],
    },
  },
  {
    name: "propose_diff",
    description: "Propone un cambio concreto (search/replace exacto) en un archivo. No lo aplica.",
    input_schema: {
      type: "object",
      properties: {
        file: { type: "string" },
        reason: { type: "string" },
        oldString: { type: "string" },
        newString: { type: "string" },
      },
      required: ["file", "reason", "oldString", "newString"],
    },
  },
];

/**
 * Corre el loop agéntico. Llama `emit` por cada evento. No lanza: cualquier
 * error se reporta como evento `error` seguido de `done`.
 */
export async function runAgent(
  apiKey: string,
  projectRoot: string,
  prompt: string,
  history: { role: "user" | "assistant"; text: string }[],
  emit: (ev: AgentEmit) => void,
  abort?: AbortSignal,
): Promise<void> {
  try {
    const root = path.resolve(projectRoot);
    const rootStat = await fs.stat(root).catch(() => null);
    if (!rootStat || !rootStat.isDirectory()) {
      emit({ type: "error", message: `La ruta del proyecto no existe o no es una carpeta: ${projectRoot}` });
      emit({ type: "done" });
      return;
    }

    const client = new Anthropic({ apiKey });

    // La HERRAMIENTA hace la investigación (scoping + selección de archivos) y
    // la pre-carga como contexto cacheado. Así la IA gasta tokens solo en lo
    // esencial (razonar + diff) y NO re-explora. El cache_control hace que las
    // vueltas del loop no re-paguen ese contexto.
    emit({ type: "step", label: "Investigando el proyecto (sin gastar IA)…" });
    const projectContext = await buildProjectContext(root, prompt);
    const systemBlocks: Anthropic.TextBlockParam[] = [
      { type: "text", text: SYSTEM_PROMPT },
      {
        type: "text",
        text: `CONTEXTO DEL PROYECTO (ya investigado por la herramienta):\n\n${projectContext}`,
        cache_control: { type: "ephemeral" },
      },
    ];

    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role, content: h.text }) as Anthropic.MessageParam),
      { role: "user", content: prompt },
    ];

    let inTot = 0;
    let outTot = 0;
    let cacheRead = 0;
    let cacheCreate = 0;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (abort?.aborted) {
        emit({ type: "done" });
        return;
      }

      const resp = await client.messages.create(
        {
          model: MODEL,
          max_tokens: 8000,
          system: systemBlocks,
          tools: TOOLS,
          messages,
        },
        { signal: abort },
      );

      const u = resp.usage;
      inTot += u.input_tokens ?? 0;
      outTot += u.output_tokens ?? 0;
      cacheRead += u.cache_read_input_tokens ?? 0;
      cacheCreate += u.cache_creation_input_tokens ?? 0;

      messages.push({ role: "assistant", content: resp.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of resp.content) {
        if (block.type === "text") {
          if (block.text.trim()) emit({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          const input = (block.input ?? {}) as Record<string, unknown>;
          let resultText = "";
          try {
            switch (block.name) {
              case "read_file":
                emit({ type: "step", label: `Leyendo ${String(input.path)}` });
                resultText = await readFileTool(root, String(input.path ?? ""));
                break;
              case "list_dir":
                emit({ type: "step", label: `Listando ${String(input.path) || "raíz"}` });
                resultText = await listDirTool(root, String(input.path ?? ""));
                break;
              case "grep":
                emit({ type: "step", label: `Buscando "${String(input.pattern)}"` });
                resultText = await grepTool(
                  root,
                  String(input.pattern ?? ""),
                  input.ext ? String(input.ext) : undefined,
                );
                break;
              case "report_plan": {
                const plan = input as unknown as ChangePlan;
                emit({ type: "plan", plan });
                emit({ type: "step", label: `Plan: ${plan.nodes?.length ?? 0} lugares afectados` });
                resultText = "ok";
                break;
              }
              case "propose_diff": {
                const diff = input as unknown as ProposedDiff;
                // Verificación anti-alucinación: el oldString tiene que existir.
                try {
                  const current = await readFileTool(root, diff.file);
                  if (!current.includes(diff.oldString)) {
                    resultText =
                      "ADVERTENCIA: el oldString no se encontró textualmente en el archivo. Releé el archivo y mandá el fragmento exacto.";
                    break;
                  }
                } catch (e) {
                  resultText = `No pude leer ${diff.file}: ${(e as Error).message}`;
                  break;
                }
                emit({ type: "diff", diff });
                emit({ type: "step", label: `Cambio propuesto en ${diff.file}` });
                resultText = "ok";
                break;
              }
              default:
                resultText = `herramienta desconocida: ${block.name}`;
            }
          } catch (e) {
            resultText = `Error: ${(e as Error).message}`;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultText,
          });
        }
      }

      if (resp.stop_reason === "tool_use" && toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
        continue;
      }
      // end_turn (o sin tools) → terminamos.
      break;
    }

    // Uso REAL de tokens de la API (no estimado). cacheRead = lo que NO se
    // re-pagó gracias al caching del contexto.
    emit({
      type: "step",
      label: `Tokens reales — entrada ${inTot} (cache leído ${cacheRead}, creado ${cacheCreate}) · salida ${outTot} · total ${inTot + outTot}`,
    });
    emit({ type: "done" });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const msg =
      err.status === 401
        ? "La API key fue rechazada por Anthropic (revisá que sea válida y tenga crédito)."
        : err.message ?? "Error inesperado del agente IA";
    emit({ type: "error", message: msg });
    emit({ type: "done" });
  }
}

/** Aplica los diffs propuestos al disco, determinísticamente. Sandbox por root. */
export async function applyProposedDiffs(
  projectRoot: string,
  diffs: ProposedDiff[],
): Promise<{ applied: number; failures: { file: string; error: string }[] }> {
  const root = path.resolve(projectRoot);
  let applied = 0;
  const failures: { file: string; error: string }[] = [];
  for (const d of diffs) {
    try {
      const abs = safeResolve(root, d.file);
      const content = await fs.readFile(abs, "utf8");
      if (!content.includes(d.oldString)) {
        failures.push({ file: d.file, error: "el texto original ya no está (¿archivo cambió?)" });
        continue;
      }
      // Reemplaza solo la PRIMERA ocurrencia (oldString debe ser único).
      const updated = content.replace(d.oldString, d.newString);
      await fs.writeFile(abs, updated, "utf8");
      applied++;
    } catch (e) {
      failures.push({ file: d.file, error: (e as Error).message });
    }
  }
  return { applied, failures };
}
