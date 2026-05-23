import type { FocusConnectionPayload } from "@/lib/types";
import { directionOf, type FocusDirection } from "./focusDirection";

/** P1 — output of {@link buildFocusEdgeDescriptors}. One entry per arista
 *  that the graph should render. `siblingCount === 1` is the straight-line
 *  case; `aggregatedMethods` is non-null only on the "Por clase" collapsed
 *  representative edge.
 *
 *  P5 — `curvature` and `bidirectional` mark a (focus, peripheral) pair where
 *  both directions exist. The opposite signs ensure the two arrows curve
 *  away from each other instead of overlapping into a single visual line.
 *
 *  This is the data layer FocusGraph feeds into ReactFlow's Edge[]. Keeping
 *  it pure (no React, no store imports) makes it cheap to unit-test the
 *  per-method dedupe + curvature math from vitest. */
export interface FocusEdgeDescriptor {
  /** ReactFlow edge id — stable across renders so the draw animation
   *  survives layout rebalances. */
  edgeId: string;
  /** Peripheral class id (target of the edge). */
  classId: string;
  /** Connection from the store this descriptor represents (the "head" of the
   *  group when collapsing; the specific (id, method) tuple otherwise). */
  connection: FocusConnectionPayload;
  /** 0-based index inside the parallel direction group — drives the
   *  perpendicular sibling offset in FocusEdge. */
  siblingIndex: number;
  /** Total siblings in the same direction group (1 → no sibling fan). */
  siblingCount: number;
  /** Methods collapsed into this edge in "class" mode. Null in "method"
   *  mode or when no methods resolved. */
  aggregatedMethods: string[] | null;
  /** P5 — sign of the bidirectional bow. {@code +1} or {@code -1} when the
   *  (focus, peripheral) pair has edges in both directions; {@code 0}
   *  otherwise. FocusEdge translates this to a perpendicular control point
   *  so the two arrows curve apart in opposite directions. */
  curvature: 1 | -1 | 0;
  /** True when this descriptor belongs to a peripheral that has edges in
   *  both directions. Mirrors {@code curvature !== 0}; exposed separately
   *  for clearer test assertions. */
  bidirectional: boolean;
}

/**
 * Group a flat list of {@link FocusConnectionPayload} by peripheral class id
 * and emit the edge descriptors the graph should render.
 *
 * Two-level grouping:
 *  - First by peripheral class id (`conn.id`) so the radial layout keeps one
 *    card per class.
 *  - Then by direction (incoming vs outgoing). When both subgroups are
 *    non-empty, the pair is bidirectional — outgoing edges get
 *    {@code curvature = +1}, incoming edges get {@code -1}, so they bow
 *    apart in FocusEdge.
 *
 *  - In "method" mode (default): one descriptor per connection inside each
 *    direction subgroup, labelled with its sibling index inside the subgroup.
 *  - In "class" mode: one collapsed descriptor per direction subgroup,
 *    carrying the full list of invoked-method names so FocusEdge can render
 *    the "+N métodos" badge.
 *
 * Order is preserved by first-arrival across the input list, so the radial
 * layout in FocusGraph keeps placing newly-arrived peripherals at the next
 * angular slot rather than rotating the whole ring on every emit.
 */
export function buildFocusEdgeDescriptors(
  visibleConnections: FocusConnectionPayload[],
  edgeGrouping: "method" | "class",
): FocusEdgeDescriptor[] {
  const byClassId = new Map<string, FocusConnectionPayload[]>();
  const orderedClassIds: string[] = [];
  for (const conn of visibleConnections) {
    if (!byClassId.has(conn.id)) {
      byClassId.set(conn.id, []);
      orderedClassIds.push(conn.id);
    }
    byClassId.get(conn.id)!.push(conn);
  }

  const descriptors: FocusEdgeDescriptor[] = [];
  for (const classId of orderedClassIds) {
    const group = byClassId.get(classId)!;
    const outgoing = group.filter((c) => directionOf(c.connectionType) === "outgoing");
    const incoming = group.filter((c) => directionOf(c.connectionType) === "incoming");
    const isBidi = outgoing.length > 0 && incoming.length > 0;

    const emit = (
      subgroup: FocusConnectionPayload[],
      dir: FocusDirection,
      curvature: 1 | -1 | 0,
    ) => {
      if (subgroup.length === 0) return;
      if (edgeGrouping === "class") {
        const head = subgroup[0];
        const methodNames = subgroup
          .map((g) => g.viaMethodInTarget ?? null)
          .filter((m): m is string => Boolean(m));
        descriptors.push({
          edgeId: `focus-edge-${classId}-${dir}-aggregated`,
          classId,
          connection: head,
          siblingIndex: 0,
          siblingCount: 1,
          aggregatedMethods: methodNames,
          curvature,
          bidirectional: isBidi,
        });
      } else {
        subgroup.forEach((conn, j) => {
          descriptors.push({
            edgeId: `focus-edge-${classId}-${dir}-${conn.viaMethodInTarget ?? `idx${j}`}`,
            classId,
            connection: conn,
            siblingIndex: j,
            siblingCount: subgroup.length,
            aggregatedMethods: null,
            curvature,
            bidirectional: isBidi,
          });
        });
      }
    };

    if (isBidi) {
      // Outgoing bows positive (CW in the radial layout); incoming bows
      // negative. Either sign convention works as long as the two are
      // opposite — FocusEdge translates the sign to a perpendicular offset.
      emit(outgoing, "outgoing", 1);
      emit(incoming, "incoming", -1);
    } else if (outgoing.length > 0) {
      emit(outgoing, "outgoing", 0);
    } else {
      emit(incoming, "incoming", 0);
    }
  }
  return descriptors;
}
