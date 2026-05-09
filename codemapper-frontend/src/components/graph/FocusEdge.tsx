"use client";

import { memo, type MouseEvent as ReactMouseEvent } from "react";
import {
  EdgeLabelRenderer,
  getStraightPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";
import { ChevronRight } from "lucide-react";
import type { FocusConnectionType, ParsedMethod } from "@/lib/types";
import { useGraphStore } from "@/store/graphStore";

interface FocusEdgeData extends Record<string, unknown> {
  connectionType: FocusConnectionType;
  index: number;
  /** Method on the source side that produces the relationship. Rendered as
   *  the secondary label so the user sees which method does the call. */
  viaMethodInSource?: string | null;
  /** For INVOKES_OUTGOING, the called method on the target. */
  viaMethodInTarget?: string | null;
  /** F3 — peripheral lives in /test/java/. Edge is rendered as a thin grey
   *  dashed line so production relationships stay visually dominant. */
  isTest?: boolean;
  /** F3 — peripheral mocks the focus class. A small mask icon is overlaid at
   *  the edge midpoint, communicating "this isn't a real call, it's a mock". */
  isMock?: boolean;
}

const TYPE_STYLE: Record<
  FocusConnectionType,
  { stroke: string; width: number; dash?: string; label: string }
> = {
  // Always vivid red for invocations so the line stays legible on dark bg —
  // direction is communicated by the arrow marker, not the color.
  CALLS: { stroke: "#B91C42", width: 2, label: "Llama a" },
  CALLED_BY: { stroke: "#B91C42", width: 2, label: "Llamado por" },
  EXTENDS: { stroke: "#C0C0C8", width: 2.5, label: "Extiende" },
  IMPLEMENTS: { stroke: "#C0C0C8", width: 1.75, dash: "6 5", label: "Implementa" },
  USES_PROPERTIES: { stroke: "#8B0F2A", width: 1.75, dash: "3 4", label: "Usa props" },
  INVOKES_METHOD: { stroke: "#B91C42", width: 2, label: "Invocado" },
  INVOKES_OUTGOING: { stroke: "#B91C42", width: 2, label: "Invoca" },
};

// STAGGER stays at 0: the moment we make it cumulative again (e.g. 0.5s ×
// index) we re-introduce the "three waves" bug — by the 30th edge the
// total ramp is 15s+ and remounts catch animations mid-flight, restarting
// them visibly. Root cause of the remount is in BUG_PENDIENTE_OLAS_STREAMING.md.
// BASE_DELAY gives every edge a small fixed head start so the peripheral
// node card paints before its line starts drawing — without it the line
// races the node into existence and shows up first, which reads weird.
const STAGGER_S = 0;
const BASE_DELAY_S = 0.35;

/** Connection types where the *peripheral* is the caller and the focus is the
 *  callee — the arrow head should sit on the focus side (markerStart) so the
 *  user reads "peripheral ──▶ focus". */
function isInbound(ct: FocusConnectionType): boolean {
  return ct === "CALLED_BY" || ct === "INVOKES_METHOD";
}

/** Pixels we shrink the path on the arrow side so the triangle marker is
 *  visibly detached from the card. With clearance C and markerWidth W the
 *  apex sits C px from the card edge and the back of the head sits at C+W,
 *  so we want this generous enough that you read "arrow → card" with a gap.
 *  Cards have border-radius + outer glow that visually inflate the boundary
 *  by ~10–14 px, so the value here is the *visual* gap minus that fudge. */
const ARROW_CLEARANCE = 48;

/** Center point of an InternalNode in flow coordinates. Falls back to the
 *  declared width/height when the ResizeObserver hasn't reported yet. */
function nodeCenter(node: InternalNode): { x: number; y: number } {
  const w = node.measured?.width ?? node.width ?? 0;
  const h = node.measured?.height ?? node.height ?? 0;
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

/** Floating endpoint — find where the line from {@code node}'s center to
 *  {@code other} exits the node's bounding rectangle. Replaces ReactFlow's
 *  handle-based source/target resolution: the edge no longer snaps to one of
 *  four cardinal handles, so the layout can rebalance without the handle id
 *  changing (which used to make ReactFlow tear down and remount the edge,
 *  restarting the CSS draw animation from zero on every new arrival). */
function rectIntersection(
  node: InternalNode,
  other: { x: number; y: number },
): { x: number; y: number } {
  const w = node.measured?.width ?? node.width ?? 0;
  const h = node.measured?.height ?? node.height ?? 0;
  const cx = node.position.x + w / 2;
  const cy = node.position.y + h / 2;
  const dx = other.x - cx;
  const dy = other.y - cy;
  if ((dx === 0 && dy === 0) || w === 0 || h === 0) {
    return { x: cx, y: cy };
  }
  // Smallest scale s.t. either |dx*scale|=w/2 or |dy*scale|=h/2 — i.e. hit
  // whichever rect side the line reaches first.
  const scale = Math.min(
    dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity,
    dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function FocusEdgeComponent({
  id,
  source,
  target,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as FocusEdgeData;
  const ct = edgeData.connectionType;
  const baseStyle = TYPE_STYLE[ct] ?? TYPE_STYLE.CALLS;
  // F3 — tests get a flatter, dashed treatment so they recede behind runtime
  // edges. Override after the base lookup so the connection-type label still
  // reads correctly in the chip.
  const style = edgeData.isTest
    ? { ...baseStyle, stroke: "#7B8AAD", width: 1.5, dash: "4 3" }
    : baseStyle;
  const inbound = isInbound(ct);
  const focusClass = useGraphStore((s) => s.focusClass);
  const focusMethod = useGraphStore((s) => s.focusMethod);
  const focusConnections = useGraphStore((s) => s.focusConnections);
  const openMethodSheet = useGraphStore((s) => s.openMethodSheet);
  const openClassSheetWithImportHighlight = useGraphStore(
    (s) => s.openClassSheetWithImportHighlight,
  );

  // Floating endpoints — read both nodes from the ReactFlow store and project
  // the line center-to-center onto each card's rectangle. Beats the old
  // sourceX/sourceY/targetX/targetY props (which came from a handle that kept
  // changing as the radial layout rebalanced). When either node hasn't been
  // measured yet we render nothing — the next tick will bring it back.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const srcCenter = nodeCenter(sourceNode);
  const tgtCenter = nodeCenter(targetNode);
  const sourceEdge = rectIntersection(sourceNode, tgtCenter);
  const targetEdge = rectIntersection(targetNode, srcCenter);

  // Trim the path on the marker side so the triangle isn't drawn underneath
  // the peripheral / focus card. The trimmed endpoints feed getStraightPath;
  // the centered label sits on the resulting visible midpoint.
  const dx = targetEdge.x - sourceEdge.x;
  const dy = targetEdge.y - sourceEdge.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = inbound ? sourceEdge.x + ux * ARROW_CLEARANCE : sourceEdge.x;
  const sy = inbound ? sourceEdge.y + uy * ARROW_CLEARANCE : sourceEdge.y;
  const tx = inbound ? targetEdge.x : targetEdge.x - ux * ARROW_CLEARANCE;
  const ty = inbound ? targetEdge.y : targetEdge.y - uy * ARROW_CLEARANCE;

  const [path, labelX, labelY] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });
  const delaySec = BASE_DELAY_S + (edgeData.index ?? 0) * STAGGER_S;

  // Pick the most informative method-level annotation per direction.
  // The chip surfaces the method that owns the relationship — clicking it
  // opens that method's source in the right-hand sheet. The owning class
  // depends on the connection type: outbound (focus calls X) lives on focus;
  // inbound (X calls focus) and the called-method label live on peripheral.
  let viaLabel: string | null = null;
  let viaMethodName: string | null = null;
  let viaClassId: string | null = null;
  let viaMethods: ParsedMethod[] = [];
  // Tokens to mark in red inside the caller's body — typically the *callee*
  // class name and (when known) the called method name. The sheet greps the
  // displayed source for these and decorates the matching lines.
  let highlightClassName: string | null = null;
  let highlightMethodName: string | null = null;
  if (ct === "CALLED_BY" || ct === "INVOKES_METHOD") {
    // Fallback "via import" — when the parser detected this caller via its
    // import statement but couldn't identify which method actually uses the
    // focus (typical when the import is dead, or the use is buried in a
    // hard-to-resolve expression). Better than a mute chip — the dev knows
    // the connection is weak and probably needs a manual look.
    viaLabel = edgeData.viaMethodInSource
      ? `via ${edgeData.viaMethodInSource}()`
      : "via import";
    viaMethodName = edgeData.viaMethodInSource ?? null;
    const peripheral = focusConnections.find((c) => c.id === target);
    viaClassId = peripheral?.id ?? null;
    viaMethods = peripheral?.methods ?? [];
    // Body shown = peripheral's calling method. Mark where it touches focus.
    highlightClassName = focusClass?.name ?? null;
    highlightMethodName =
      ct === "INVOKES_METHOD" ? focusMethod?.methodName ?? null : null;
  } else if (ct === "CALLS") {
    // Same fallback pattern as CALLED_BY: when the focus's specific calling
    // method can't be pinned down, the chip still opens the focus sheet and
    // highlights every line that mentions the peripheral.
    viaLabel = edgeData.viaMethodInSource
      ? `desde ${edgeData.viaMethodInSource}()`
      : "desde uso interno";
    viaMethodName = edgeData.viaMethodInSource ?? null;
    viaClassId = focusClass?.id ?? null;
    viaMethods = focusClass?.methods ?? [];
    // Body shown = focus's calling method. Mark where it touches peripheral.
    const peripheral = focusConnections.find((c) => c.id === target);
    highlightClassName = peripheral?.name ?? null;
    highlightMethodName = null;
  } else if (ct === "INVOKES_OUTGOING") {
    // Method-focus mode: the focus method invokes peripheral. When the
    // specific target method isn't resolved, fall back to "invocación
    // oblicua" and route to the peripheral's class sheet.
    viaLabel = edgeData.viaMethodInTarget
      ? `${edgeData.viaMethodInTarget}()`
      : "invocación oblicua";
    viaMethodName = edgeData.viaMethodInTarget ?? null;
    const peripheral = focusConnections.find((c) => c.id === target);
    viaClassId = peripheral?.id ?? null;
    viaMethods = peripheral?.methods ?? [];
    // Body shown = focus method. Mark the call to peripheral.X().
    highlightClassName = peripheral?.name ?? null;
    highlightMethodName = edgeData.viaMethodInTarget ?? null;
  }

  const viaMethod = viaMethodName
    ? viaMethods.find((m) => m.name === viaMethodName) ?? null
    : null;
  // The chip is ALWAYS clickable as long as we know which class to open.
  // When a specific method is resolved → opens the method sheet with a
  // line-level highlight. When it's not (the "via import" / "desde uso
  // interno" / "invocación oblicua" fallbacks), opens the class sheet
  // with the highlight applied to every line that mentions the partner
  // class. Either way, the dev lands somewhere useful.
  const viaClickable = Boolean(viaClassId);
  const handleViaClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!viaClassId) return;
    if (viaMethod) {
      openMethodSheet(viaClassId, viaMethod, {
        className: highlightClassName,
        methodName: highlightMethodName,
      });
      return;
    }
    // Method not resolved → fall back to the class sheet with the partner
    // class name as the highlight token. ClassView will mark every line
    // in the source that mentions it (the import line, plus any textual
    // reference if there is one).
    if (highlightClassName) {
      openClassSheetWithImportHighlight(viaClassId, highlightClassName);
    } else {
      // No partner name available — just open the class sheet.
      useGraphStore.getState().selectNode(viaClassId);
    }
  };

  const markerId = `focus-arrow-${id}`;
  const markerRef = `url(#${markerId})`;

  return (
    <>
      <g
        className="cm-focus-edge-group"
        style={{
          color: style.stroke,
          ["--cm-focus-delay" as string]: `${delaySec}s`,
        }}
      >
        <defs>
          {/* Filled triangle, apex at refX=10 so the tip lands on the line.
              orient="auto-start-reverse" lets the same marker work for both
              markerStart (rotated 180°) and markerEnd. */}
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            markerWidth="9"
            markerHeight="9"
            refX="10"
            refY="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={style.stroke} />
          </marker>
        </defs>

        {/* Wide invisible hit area so the label/glow toggles on edge hover */}
        <path
          d={path}
          stroke="transparent"
          strokeWidth={20}
          fill="none"
          style={{ cursor: "pointer" }}
        />
        <path
          id={id}
          d={path}
          className="cm-focus-edge-path react-flow__edge-path"
          fill="none"
          markerStart={inbound ? markerRef : undefined}
          markerEnd={inbound ? undefined : markerRef}
          style={{
            stroke: style.stroke,
            strokeWidth: style.width,
            strokeDasharray: style.dash ?? "1500",
          }}
        />
      </g>

      {/* Label rides the midpoint. Two stacked rows: the connection type on
          top, the method-level annotation underneath when available. */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "none",
          }}
          className="flex flex-col items-center gap-0.5"
        >
          <span
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-white shadow-sm"
            style={{ backgroundColor: style.stroke }}
          >
            {/* F3 — mask icon when the peripheral mocks the focus. Inline
                SVG so we don't pay the lucide tree-shake cost on every edge. */}
            {edgeData.isMock && (
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2 12c5 0 5-4 10-4s5 4 10 4-5 6-10 6-5-6-10-6Z" />
                <circle cx="8" cy="12" r="1.4" fill="currentColor" />
                <circle cx="16" cy="12" r="1.4" fill="currentColor" />
              </svg>
            )}
            {edgeData.isTest ? "Test · " : ""}
            {style.label}
          </span>
          {viaLabel ? (
            viaClickable ? (
              <button
                type="button"
                onClick={handleViaClick}
                style={{ pointerEvents: "auto" }}
                className="group flex items-center gap-1 rounded-sm border border-[var(--border-silver)] bg-[var(--bg-base)]/95 px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-tight text-[var(--silver-mid)] transition-colors hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60 cursor-pointer"
                title="Ver código en la sheet"
              >
                <span>{viaLabel}</span>
                <ChevronRight className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            ) : (
              <span className="rounded-sm border border-[var(--border-silver)] bg-[var(--bg-base)]/95 px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-tight text-[var(--silver-mid)]">
                {viaLabel}
              </span>
            )
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const FocusEdge = memo(FocusEdgeComponent);
