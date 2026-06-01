import { describe, it, expect } from "vitest";
import { parseManualResponse } from "../iaGrafo";

describe("parseManualResponse", () => {
  it("repara saltos de línea REALES dentro de un string (caso Claude que wrapea)", () => {
    // \n y \t acá son caracteres reales → quedan DENTRO del string JSON, que es
    // inválido hasta que el reparador los escapa.
    const raw =
      '{\n  "summary": "linea uno\n  linea dos con (parentesis) y `backticks` y\ttab",\n  "nodes": [{"id":"a","label":"A","role":"objetivo"}],\n  "edges": [],\n  "diffs": []\n}';
    const r = parseManualResponse(raw);
    expect(r.plan.nodes).toHaveLength(1);
    expect(r.plan.summary).toContain("linea dos");
    expect(r.diffs).toHaveLength(0);
  });

  it("parsea con fences ```json", () => {
    const raw = '```json\n{"summary":"x","nodes":[],"edges":[],"diffs":[]}\n```';
    const r = parseManualResponse(raw);
    expect(r.plan.summary).toBe("x");
  });

  it("parsea aunque haya prosa alrededor del objeto", () => {
    const raw =
      'Acá tenés el análisis:\n{"summary":"y","nodes":[{"id":"a","label":"A","role":"caller"}],"edges":[]}\nlisto.';
    const r = parseManualResponse(raw);
    expect(r.plan.nodes).toHaveLength(1);
    expect(r.plan.summary).toBe("y");
  });

  it("tira error claro si no hay nodes", () => {
    expect(() => parseManualResponse('{"summary":"z"}')).toThrow();
  });
});
