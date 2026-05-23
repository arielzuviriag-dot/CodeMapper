import type { FocusConnectionPayload } from "@/lib/types";

/** P1 — output of {@link buildFocusEdgeDescriptors}. One entry per arista
 *  that the graph should render. `siblingCount === 1` is the straight-line
 *  case; `aggregatedMethods` is non-null only on the "Por clase" collapsed
 *  representative edge.
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
  /** 0-based index inside the (focus, peripheral) parallel group — drives
   *  the perpendicular curve offset in FocusEdge. */
  siblingIndex: number;
  /** Total siblings in the same parallel group (1 → straight line). */
  siblingCount: number;
  /** Methods collapsed into this edge in "class" mode. Null in "method"
   *  mode or when no methods resolved. */
  aggregatedMethods: string[] | null;
}

/**
 * Group a flat list of {@link FocusConnectionPayload} by peripheral class id
 * and emit the edge descriptors the graph should render.
 *
 *  - In "method" mode (default): one descriptor per connection. Connections
 *    sharing a `(classId, viaMethodInTarget)` key are already deduped at the
 *    store layer, so this just labels each with its 0-based position inside
 *    its group plus the group size — enough for FocusEdge to space the
 *    parallel arrows perpendicularly.
 *  - In "class" mode: one descriptor per peripheral class, carrying the full
 *    list of invoked-method names as `aggregatedMethods` so FocusEdge can
 *    render a "+N métodos" badge with the names as a tooltip.
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
    if (edgeGrouping === "class") {
      const head = group[0];
      const methodNames = group
        .map((g) => g.viaMethodInTarget ?? null)
        .filter((m): m is string => Boolean(m));
      descriptors.push({
        edgeId: `focus-edge-${classId}-aggregated`,
        classId,
        connection: head,
        siblingIndex: 0,
        siblingCount: 1,
        aggregatedMethods: methodNames,
      });
    } else {
      group.forEach((conn, j) => {
        descriptors.push({
          edgeId: `focus-edge-${classId}-${conn.viaMethodInTarget ?? `idx${j}`}`,
          classId,
          connection: conn,
          siblingIndex: j,
          siblingCount: group.length,
          aggregatedMethods: null,
        });
      });
    }
  }
  return descriptors;
}
