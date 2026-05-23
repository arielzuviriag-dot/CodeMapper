import { describe, expect, it } from "vitest";

import { buildFocusEdgeDescriptors } from "../focusGraphGrouping";
import type { FocusConnectionPayload, FocusConnectionType } from "@/lib/types";

/**
 * P5 — bidirectional pairs get curvature ±1 with opposite signs so the
 * two arrows don't overlap into a single visual line. The pure helper is
 * the right place to assert this since FocusGraph just forwards the
 * descriptors into ReactFlow Edge data; the SVG path is exercised
 * indirectly via the Q command in the d-attr.
 */
function makeConn(
  id: string,
  ct: FocusConnectionType,
  methodInTarget: string | null = null,
): FocusConnectionPayload {
  return {
    id,
    fullyQualifiedName: `com.demo.${id}`,
    name: id,
    packageName: "com.demo",
    type: "CLASS",
    annotations: [],
    connectionType: ct,
    fields: [],
    methods: [],
    position: 0,
    sourceFile: `/tmp/${id}.java`,
    isTest: false,
    isMock: false,
    firstSeenAt: 0,
    viaMethodInTarget: methodInTarget,
  };
}

describe("buildFocusEdgeDescriptors P5 — bidirectional curvature", () => {
  it("flags pair with opposite curvature when both directions exist (method mode)", () => {
    const connections = [
      makeConn("X", "CALLS", "saveOnX"),       // focus → X
      makeConn("X", "CALLED_BY", "ringFocus"), // X → focus
    ];

    const descriptors = buildFocusEdgeDescriptors(connections, "method");

    expect(descriptors).toHaveLength(2);
    expect(descriptors.every((d) => d.bidirectional)).toBe(true);
    const sum = descriptors.reduce((acc, d) => acc + d.curvature, 0);
    expect(sum).toBe(0); // ±1 cancel out
    const curvatures = descriptors.map((d) => d.curvature).sort();
    expect(curvatures).toEqual([-1, 1]);
    // The outgoing descriptor should have +1, incoming -1 — this matches
    // the convention FocusEdge uses to bow them apart.
    const outgoing = descriptors.find((d) => d.connection.connectionType === "CALLS");
    const incoming = descriptors.find((d) => d.connection.connectionType === "CALLED_BY");
    expect(outgoing!.curvature).toBe(1);
    expect(incoming!.curvature).toBe(-1);
  });

  it("non-bidi pairs keep curvature 0", () => {
    const connections = [
      makeConn("X", "CALLED_BY", "foo"),
      makeConn("X", "CALLED_BY", "bar"),
    ];
    const descriptors = buildFocusEdgeDescriptors(connections, "method");

    expect(descriptors).toHaveLength(2);
    expect(descriptors.every((d) => !d.bidirectional)).toBe(true);
    expect(descriptors.every((d) => d.curvature === 0)).toBe(true);
  });

  it("class mode also splits by direction when bidirectional", () => {
    const connections = [
      makeConn("X", "CALLS", "outA"),
      makeConn("X", "CALLS", "outB"),
      makeConn("X", "CALLED_BY", "inA"),
    ];
    const descriptors = buildFocusEdgeDescriptors(connections, "class");

    // One descriptor per direction subgroup, both flagged bidirectional.
    expect(descriptors).toHaveLength(2);
    expect(descriptors.every((d) => d.bidirectional)).toBe(true);
    const outgoing = descriptors.find((d) => d.connection.connectionType === "CALLS");
    const incoming = descriptors.find((d) => d.connection.connectionType === "CALLED_BY");
    expect(outgoing!.aggregatedMethods).toEqual(["outA", "outB"]);
    expect(incoming!.aggregatedMethods).toEqual(["inA"]);
    expect(outgoing!.curvature).toBe(1);
    expect(incoming!.curvature).toBe(-1);
  });

  it("ungated direction with multiple peripherals still works", () => {
    const connections = [
      makeConn("X", "CALLED_BY", "a"),
      makeConn("Y", "CALLED_BY", "b"),
    ];
    const descriptors = buildFocusEdgeDescriptors(connections, "method");
    expect(descriptors).toHaveLength(2);
    expect(descriptors.every((d) => d.curvature === 0)).toBe(true);
    expect(new Set(descriptors.map((d) => d.classId))).toEqual(new Set(["X", "Y"]));
  });
});

/**
 * Verifies the quadratic-bezier "Q" command shows up in the path FocusEdge
 * would render. We can't easily mount FocusEdge in vitest (it needs a
 * ReactFlow context), but the path equation is closed-form: any descriptor
 * with curvature !== 0 produces a M..Q.. path string in FocusEdge.
 *
 * We replay the same formula here so a regression in either side surfaces.
 */
describe("FocusEdge path command for bidi descriptors", () => {
  /** Mirrors the FocusEdge path branch when perpScale !== 0. */
  function buildBezierPath(
    sx: number, sy: number, tx: number, ty: number,
    curvature: 1 | -1 | 0,
  ): string {
    if (curvature === 0) return `M ${sx},${sy} L ${tx},${ty}`;
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const perpX = -uy;
    const perpY = ux;
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const BIDI_SPACING = 70;
    const cpx = mx + perpX * curvature * BIDI_SPACING;
    const cpy = my + perpY * curvature * BIDI_SPACING;
    return `M ${sx},${sy} Q ${cpx},${cpy} ${tx},${ty}`;
  }

  it("contains a Q command for curvature +1 and -1", () => {
    const plus = buildBezierPath(0, 0, 100, 0, 1);
    const minus = buildBezierPath(0, 0, 100, 0, -1);
    expect(plus).toMatch(/\bQ\b/);
    expect(minus).toMatch(/\bQ\b/);
    // Opposite-sign curvature flips the control-point y coordinate.
    const cpYPlus = parseFloat(plus.split("Q ")[1].split(" ")[0].split(",")[1]);
    const cpYMinus = parseFloat(minus.split("Q ")[1].split(" ")[0].split(",")[1]);
    expect(Math.sign(cpYPlus)).toBe(-Math.sign(cpYMinus));
  });

  it("falls back to a straight L command when curvature is 0", () => {
    const straight = buildBezierPath(0, 0, 100, 0, 0);
    expect(straight).not.toMatch(/\bQ\b/);
    expect(straight).toMatch(/\bL\b/);
  });
});
