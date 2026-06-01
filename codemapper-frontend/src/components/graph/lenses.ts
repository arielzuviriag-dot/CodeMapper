/**
 * Lentes del grafo — overlays que recolorean/atenúan los nodos para mostrarle
 * al dev una dimensión distinta del código, calculadas SOLO con datos que el
 * grafo ya tiene (nodos + aristas). Lógica pura (sin React) para poder testear.
 *
 * Varias son AGNÓSTICAS al lenguaje (acoplamiento, código muerto, ciclos,
 * tamaño): solo necesitan el grafo de nodos+aristas, así que sirven igual para
 * Java, TS, Python, etc. Las basadas en rol (capas, seguridad) usan las
 * anotaciones de Spring hoy; se pueden extender con reglas por framework.
 */

export type LensId =
  | "none"
  | "coupling"
  | "deadcode"
  | "cycles"
  | "layers"
  | "security"
  | "size";

export interface LensClass {
  id: string;
  name: string;
  annotations: string[];
  type: string;
  lineCount: number;
  methodCount: number;
}

export interface LensEdge {
  source: string;
  target: string;
}

export interface LensResult {
  /** id de nodo → color de acento (borde/glow). Ausente = sin acento. */
  nodeAccent: Record<string, string>;
  /** ids a atenuar (no relevantes para esta lente). */
  dimmed: Set<string>;
  /** aristas a resaltar como problemáticas, clave "source|target". */
  edgeFlags: Set<string>;
  /** leyenda de colores para el panel. */
  legend: { color: string; label: string }[];
  /** resumen corto para el panel. */
  summary: string;
}

const COLORS = {
  hot: "#DC2626",
  warn: "#D9A441",
  bordo: "#B91C42",
  silver: "#A8A8B0",
  blue: "#2F81F7",
};

function emptyResult(): LensResult {
  return { nodeAccent: {}, dimmed: new Set(), edgeFlags: new Set(), legend: [], summary: "" };
}

function stripAnn(a: string): string {
  return a.replace(/^@/, "").split("(")[0];
}

function isEntryPoint(c: LensClass): boolean {
  if (c.type === "WEB_SCREEN" || c.type === "MOBILE_SCREEN") return true;
  return c.annotations.map(stripAnn).some((s) => s === "RestController" || s === "Controller");
}

/** Capa arquitectónica (menor = más arriba). -1 = pantallas front. */
function layerOf(c: LensClass): number {
  if (c.type === "WEB_SCREEN" || c.type === "MOBILE_SCREEN") return -1;
  const ann = c.annotations.map(stripAnn);
  if (ann.some((a) => a === "RestController" || a === "Controller")) return 0;
  if (ann.some((a) => a === "Service" || a === "Component")) return 1;
  if (ann.some((a) => a === "Repository")) return 2;
  if (ann.some((a) => a === "Entity")) return 3;
  if (ann.some((a) => a === "Configuration")) return 4;
  return 99; // desconocido → no participa de reglas de capa
}

function degrees(nodes: LensClass[], edges: LensEdge[]) {
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    outDeg.set(n.id, 0);
  }
  for (const e of edges) {
    if (e.source === e.target) continue;
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  return { inDeg, outDeg };
}

/** Nodos que participan de algún ciclo (SCC de tamaño > 1, o self-loop). */
function nodesInCycles(nodes: LensClass[], edges: LensEdge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  const ids = new Set(nodes.map((n) => n.id));
  const selfLoops = new Set<string>();
  for (const e of edges) {
    if (e.source === e.target) {
      if (ids.has(e.source)) selfLoops.add(e.source);
      continue;
    }
    if (ids.has(e.source) && ids.has(e.target)) adj.get(e.source)!.push(e.target);
  }
  // Tarjan SCC (iterativo simple con recursión acotada al tamaño del grafo).
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const inCycle = new Set<string>(selfLoops);

  const strongconnect = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) for (const c of comp) inCycle.add(c);
    }
  };
  for (const n of nodes) if (!idx.has(n.id)) strongconnect(n.id);
  return inCycle;
}

/**
 * Calcula la lente activa sobre el grafo dado. Función pura.
 */
export function computeLens(
  lens: LensId,
  nodes: LensClass[],
  edges: LensEdge[],
): LensResult {
  if (lens === "none" || nodes.length === 0) return emptyResult();
  const res = emptyResult();

  if (lens === "coupling") {
    const { inDeg, outDeg } = degrees(nodes, edges);
    let max = 1;
    for (const n of nodes) max = Math.max(max, (inDeg.get(n.id) ?? 0) + (outDeg.get(n.id) ?? 0));
    let high = 0;
    for (const n of nodes) {
      const d = (inDeg.get(n.id) ?? 0) + (outDeg.get(n.id) ?? 0);
      if (d >= 0.66 * max && d > 2) {
        res.nodeAccent[n.id] = COLORS.hot;
        high++;
      } else if (d >= 0.33 * max && d > 1) {
        res.nodeAccent[n.id] = COLORS.warn;
      } else {
        res.dimmed.add(n.id);
      }
    }
    res.legend = [
      { color: COLORS.hot, label: "Muy acoplada (posible God class)" },
      { color: COLORS.warn, label: "Acoplamiento medio" },
    ];
    res.summary = `${high} clase(s) muy acopladas (de ${nodes.length})`;
    return res;
  }

  if (lens === "deadcode") {
    const { inDeg } = degrees(nodes, edges);
    let dead = 0;
    for (const n of nodes) {
      const orphan = (inDeg.get(n.id) ?? 0) === 0 && !isEntryPoint(n);
      if (orphan) {
        res.nodeAccent[n.id] = COLORS.hot;
        dead++;
      } else {
        res.dimmed.add(n.id);
      }
    }
    res.legend = [{ color: COLORS.hot, label: "Sin quien la llame (¿código muerto?)" }];
    res.summary = `${dead} clase(s) sin callers (excluye endpoints)`;
    return res;
  }

  if (lens === "cycles") {
    const inCycle = nodesInCycles(nodes, edges);
    for (const n of nodes) {
      if (inCycle.has(n.id)) res.nodeAccent[n.id] = COLORS.hot;
      else res.dimmed.add(n.id);
    }
    for (const e of edges) {
      if (inCycle.has(e.source) && inCycle.has(e.target)) {
        res.edgeFlags.add(`${e.source}|${e.target}`);
      }
    }
    res.legend = [{ color: COLORS.hot, label: "Participa de un ciclo de dependencias" }];
    res.summary = `${inCycle.size} clase(s) en ciclos`;
    return res;
  }

  if (lens === "layers") {
    let violations = 0;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const flagged = new Set<string>();
    for (const e of edges) {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t) continue;
      const ls = layerOf(s);
      const lt = layerOf(t);
      if (ls === 99 || lt === 99 || ls < 0 || lt < 0) continue;
      // Violación: depender "hacia arriba" (capa inferior llama a superior) o
      // saltear capas (controller → repository sin pasar por service).
      const backward = lt < ls;
      const skip = ls === 0 && lt === 2;
      if (backward || skip) {
        res.edgeFlags.add(`${e.source}|${e.target}`);
        flagged.add(e.source);
        flagged.add(e.target);
        violations++;
      }
    }
    for (const n of nodes) {
      if (flagged.has(n.id)) res.nodeAccent[n.id] = COLORS.hot;
      else res.dimmed.add(n.id);
    }
    res.legend = [{ color: COLORS.hot, label: "Dependencia que rompe las capas" }];
    res.summary = `${violations} arista(s) que violan las capas`;
    return res;
  }

  if (lens === "security") {
    let entries = 0;
    let sinks = 0;
    for (const n of nodes) {
      const ann = n.annotations.map(stripAnn);
      const isEntry =
        n.type === "WEB_SCREEN" ||
        n.type === "MOBILE_SCREEN" ||
        ann.some((a) => a === "RestController" || a === "Controller");
      const isSink =
        ann.some((a) => a === "Repository" || a === "Entity") ||
        /(?:Repository|Dao|Mapper|Storage)$/.test(n.name);
      if (isEntry) {
        res.nodeAccent[n.id] = COLORS.warn;
        entries++;
      } else if (isSink) {
        res.nodeAccent[n.id] = COLORS.hot;
        sinks++;
      } else {
        res.dimmed.add(n.id);
      }
    }
    res.legend = [
      { color: COLORS.warn, label: "Entrada / superficie de ataque (endpoint)" },
      { color: COLORS.hot, label: "Datos / persistencia (sink)" },
    ];
    res.summary = `${entries} entrada(s), ${sinks} sink(s) de datos`;
    return res;
  }

  if (lens === "size") {
    let max = 1;
    for (const n of nodes) max = Math.max(max, n.lineCount, n.methodCount * 20);
    let big = 0;
    for (const n of nodes) {
      const score = Math.max(n.lineCount, n.methodCount * 20);
      if (score >= 0.66 * max && n.lineCount > 150) {
        res.nodeAccent[n.id] = COLORS.hot;
        big++;
      } else if (score >= 0.33 * max) {
        res.nodeAccent[n.id] = COLORS.warn;
      } else {
        res.dimmed.add(n.id);
      }
    }
    res.legend = [
      { color: COLORS.hot, label: "Clase grande (muchas líneas/métodos)" },
      { color: COLORS.warn, label: "Tamaño medio" },
    ];
    res.summary = `${big} clase(s) grandes`;
    return res;
  }

  return res;
}

export const LENS_META: { id: LensId; label: string; desc: string }[] = [
  { id: "coupling", label: "Acoplamiento", desc: "Resalta clases muy conectadas (God classes)" },
  { id: "deadcode", label: "Código muerto", desc: "Clases sin quien las llame" },
  { id: "cycles", label: "Ciclos", desc: "Dependencias circulares" },
  { id: "layers", label: "Capas", desc: "Dependencias que rompen la arquitectura" },
  { id: "security", label: "Seguridad", desc: "Entradas (endpoints) y sinks de datos" },
  { id: "size", label: "Tamaño", desc: "Clases grandes por líneas/métodos" },
];
