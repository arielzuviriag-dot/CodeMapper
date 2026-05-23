import type { FocusConnectionType } from "@/lib/types";

/** P2 — direction taxonomy used by the segmented filter above the graph and
 *  by tests. INCOMING groups connection types where the peripheral points at
 *  the focus; OUTGOING groups types where the focus points out. Centralized
 *  here so a future ConnectionType is added in exactly one place. */
export type FocusDirection = "incoming" | "outgoing";

const INCOMING_TYPES: ReadonlySet<FocusConnectionType> = new Set<FocusConnectionType>([
  "CALLED_BY",
  "INVOKES_METHOD",
  "EXTENDS",
  "IMPLEMENTS",
]);

const OUTGOING_TYPES: ReadonlySet<FocusConnectionType> = new Set<FocusConnectionType>([
  "CALLS",
  "INVOKES_OUTGOING",
  "USES_PROPERTIES",
]);

export function directionOf(ct: FocusConnectionType): FocusDirection {
  return INCOMING_TYPES.has(ct) ? "incoming" : "outgoing";
}

/** Returns true when a connection of type {@code ct} should be visible under
 *  the current {@code filter}. "all" passes everything through. */
export function passesDirectionFilter(
  ct: FocusConnectionType,
  filter: "all" | FocusDirection,
): boolean {
  if (filter === "all") return true;
  return directionOf(ct) === filter;
}

export const FOCUS_DIRECTION_INCOMING_TYPES: ReadonlySet<FocusConnectionType> = INCOMING_TYPES;
export const FOCUS_DIRECTION_OUTGOING_TYPES: ReadonlySet<FocusConnectionType> = OUTGOING_TYPES;
