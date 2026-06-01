import { describe, it, expect } from "vitest";
import { computeLens, type LensClass, type LensEdge } from "../lenses";

function cls(id: string, ann: string[] = [], type = "CLASS", lineCount = 50, methodCount = 5): LensClass {
  return { id, name: id, annotations: ann, type, lineCount, methodCount };
}

// Grafo de ejemplo: Controller → Service → Repository, + un huérfano, + un ciclo A↔B.
const NODES: LensClass[] = [
  cls("Ctrl", ["@RestController"]),
  cls("Svc", ["@Service"]),
  cls("Repo", ["@Repository"], "CLASS", 40, 3),
  cls("Orphan", [], "CLASS", 300, 25), // grande y sin callers
  cls("A"),
  cls("B"),
];
const EDGES: LensEdge[] = [
  { source: "Ctrl", target: "Svc" },
  { source: "Svc", target: "Repo" },
  { source: "A", target: "B" },
  { source: "B", target: "A" }, // ciclo
];

describe("computeLens", () => {
  it("none → vacío", () => {
    const r = computeLens("none", NODES, EDGES);
    expect(Object.keys(r.nodeAccent)).toHaveLength(0);
  });

  it("deadcode marca el huérfano y NO el endpoint", () => {
    const r = computeLens("deadcode", NODES, EDGES);
    expect(r.nodeAccent["Orphan"]).toBeTruthy();
    expect(r.nodeAccent["Ctrl"]).toBeUndefined(); // endpoint: no es muerto aunque no tenga callers
    expect(r.dimmed.has("Ctrl")).toBe(true);
  });

  it("cycles detecta A↔B y no a los demás", () => {
    const r = computeLens("cycles", NODES, EDGES);
    expect(r.nodeAccent["A"]).toBeTruthy();
    expect(r.nodeAccent["B"]).toBeTruthy();
    expect(r.nodeAccent["Svc"]).toBeUndefined();
    expect(r.edgeFlags.has("A|B")).toBe(true);
    expect(r.edgeFlags.has("B|A")).toBe(true);
  });

  it("layers flagea una dependencia hacia atrás (Repo → Svc)", () => {
    const r = computeLens("layers", NODES, [
      ...EDGES,
      { source: "Repo", target: "Svc" }, // repo dependiendo de service = violación
    ]);
    expect(r.edgeFlags.has("Repo|Svc")).toBe(true);
    // Ctrl→Svc y Svc→Repo son correctas (no flageadas)
    expect(r.edgeFlags.has("Ctrl|Svc")).toBe(false);
    expect(r.edgeFlags.has("Svc|Repo")).toBe(false);
  });

  it("security clasifica entrada y sink", () => {
    const r = computeLens("security", NODES, EDGES);
    expect(r.nodeAccent["Ctrl"]).toBeTruthy(); // entrada
    expect(r.nodeAccent["Repo"]).toBeTruthy(); // sink
  });

  it("coupling resalta el nodo más conectado", () => {
    // Svc tiene grado 2 (in 1 + out 1); subimos su grado para que sea hot.
    const edges: LensEdge[] = [
      ...EDGES,
      { source: "Ctrl", target: "Repo" },
      { source: "Orphan", target: "Svc" },
      { source: "A", target: "Svc" },
    ];
    const r = computeLens("coupling", NODES, edges);
    expect(r.nodeAccent["Svc"]).toBeTruthy();
  });

  it("size marca la clase grande", () => {
    const r = computeLens("size", NODES, EDGES);
    expect(r.nodeAccent["Orphan"]).toBeTruthy();
  });
});
