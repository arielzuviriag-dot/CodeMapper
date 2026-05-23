"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  EdgeLabelRenderer,
  getStraightPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";
import { Box, ChevronRight, Plug, Plus, Zap } from "lucide-react";
import type {
  FocusConnectionType,
  FocusReferenceKind,
  ParsedMethod,
} from "@/lib/types";
import { useGraphStore } from "@/store/graphStore";

export const REFERENCE_KIND_META: Record<
  FocusReferenceKind,
  { Icon: typeof Zap; tooltip: string; testId: string }
> = {
  INVOCATION: { Icon: Zap, tooltip: "Invoca métodos", testId: "ref-kind-invocation" },
  INSTANTIATION: { Icon: Plus, tooltip: "Crea instancias", testId: "ref-kind-instantiation" },
  INJECTION: { Icon: Plug, tooltip: "Inyección sin invocación", testId: "ref-kind-injection" },
  DECLARATION: { Icon: Box, tooltip: "Solo declaración de tipo", testId: "ref-kind-declaration" },
};

/** P3 — small badge with the kind icon + native-title tooltip. Lifted out
 *  of FocusEdge so vitest can mount it without a ReactFlow context.
 *  Returns null when {@code kind} is null/undefined. */
export function ReferenceKindIcon({ kind }: { kind: FocusReferenceKind | null | undefined }) {
  if (!kind) return null;
  const meta = REFERENCE_KIND_META[kind];
  if (!meta) return null;
  const Icon = meta.Icon;
  return (
    <span
      data-testid={meta.testId}
      data-reference-kind={kind}
      title={meta.tooltip}
      aria-label={meta.tooltip}
      style={{ pointerEvents: "auto" }}
      className="flex h-4 w-4 items-center justify-center rounded-sm border border-[var(--border-silver)] bg-[var(--bg-card)] text-[var(--bordo)] shadow-sm"
    >
      <Icon className="h-3 w-3" aria-hidden />
    </span>
  );
}

interface FocusEdgeData extends Record<string, unknown> {
  connectionType: FocusConnectionType;
  index: number;
  /** Wall-clock ms (Date.now()) of when the connection arrived in the
   *  store. The draw animation is computed off elapsed-since-this-time
   *  rather than mount time — that's what survives the spurious remounts
   *  ReactFlow does on its edge layer when node positions shift. */
  firstSeenAt: number;
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
  /** P1 — 0-based index inside the group of parallel edges between the same
   *  (focus, peripheral) pair. Drives the perpendicular curve offset so
   *  arrows for save() / delete() / find() don't overlap. */
  siblingIndex?: number;
  /** P1 — total number of parallel edges in the same group. {@code 1} means
   *  no siblings (straight line). */
  siblingCount?: number;
  /** P1 — when present and non-empty, this edge is the collapsed
   *  "Por clase" representative for the (focus, peripheral) pair. Renders a
   *  "+N métodos" badge with the full list as a tooltip instead of the
   *  per-method via-label. */
  aggregatedMethods?: string[] | null;
  /** P3 — semantic category of how the connected class uses the focus.
   *  Drives the icon shown next to the type label on the edge midpoint. */
  referenceKind?: FocusReferenceKind | null;
  /** P4 — radial depth of this edge. {@code 1} = focus → depth-1 peripheral;
   *  {@code 2} = depth-1 peripheral → depth-2 sub-peripheral. Depth-2 edges
   *  are drawn thinner and dimmer so the primary radial stays dominant. */
  depth?: 1 | 2;
  /** P5 — bidirectional bow direction. {@code +1} / {@code -1} bow apart so
   *  outgoing and incoming arrows on the same pair don't overlap. {@code 0}
   *  (or undefined) keeps the path straight. */
  curvature?: 1 | -1 | 0;
  /** P5 — true when this descriptor belongs to a bidirectional pair. Mirror
   *  of {@code curvature !== 0}; passed through so consumers can branch on
   *  intent rather than the raw sign. */
  bidirectional?: boolean;
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

// Wall-clock animation timings, in ms.
//
// ANIM_DELAY_MS is the small base offset between a connection arriving and
// its line starting to draw — gives the peripheral card a beat to paint.
//
// STAGGER_MS × arrivalIndex is the per-arrow lag that creates the "wave"
// feel: arrow N starts drawing well after arrow N-1, so the eye reads them
// one by one. CAPPED at STAGGER_CAP_INDEX so the last arrow in a 32-conn
// PRO session doesn't wait 16+ seconds — past the cap, all remaining arrows
// share the same delay and finish in a tail wave.
//
// This stagger is wall-clock based (anchored to firstSeenAt + computed
// offset, NOT to component mount), so ReactFlow's edge-layer remounts on
// layout rebalance don't restart the animation. A remounting arrow reads
// firstSeenAt and arrivalIndex from data, computes "I should be at progress
// X by now", renders directly. No flicker.
const ANIM_DURATION_MS = 2000;
const ANIM_DELAY_MS = 350;
const STAGGER_MS = 350;
const STAGGER_CAP_INDEX = 12;

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

/** P1 — perpendicular spacing between two adjacent parallel arrows. El
 *  offset efectivo de la flecha i en un grupo de N es
 *  {@code (i - (N-1)/2) * SIBLING_SPACING}, así que un grupo de 5 cubre
 *  {-2,-1,0,+1,+2} × este valor. */
const SIBLING_SPACING = 56;

/** P1 — rango de parámetro t (Bézier, t∈[0,1]) usado para repartir las
 *  etiquetas a lo largo de la curva. Las hermanas se distribuyen
 *  uniformemente en {@code [0.5 - LABEL_T_RANGE/2, 0.5 + LABEL_T_RANGE/2]},
 *  así una pill queda cerca del origen y la otra cerca del destino. Para 2
 *  flechas: t = 0.25 y t = 0.75; para 3: 0.25 / 0.5 / 0.75. Combinado con
 *  {@link SIBLING_SPACING}, evita que `sendOrderEvent()` /
 *  `sendDeliveryWindowOpen()` queden apiladas en el mismo punto. */
const LABEL_T_RANGE = 0.5;

/** P5 — perpendicular offset for the bidirectional bow. Larger than
 *  {@link SIBLING_SPACING} so the outgoing/incoming pair is visibly
 *  separated even on short edges. The two opposite-sign curves end up
 *  ~140px apart at midpoint — enough room for two label chips side by
 *  side without overlapping the peripheral card. */
const BIDI_SPACING = 70;

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
  let style = edgeData.isTest
    ? { ...baseStyle, stroke: "#7B8AAD", width: 1.5, dash: "4 3" }
    : baseStyle;
  // P4 — depth-2 edges shrink and dim so the primary radial stays dominant.
  const isDeepEdge = (edgeData.depth ?? 1) === 2;
  if (isDeepEdge) {
    style = { ...style, width: style.width * 0.7 };
  }
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

  // P1 — parallel siblings curve away from the centre line so the arrows for
  // save(), delete(), find() etc. don't pile on top of each other.
  // P5 — additionally, bidirectional pairs (CALLS + CALLED_BY between focus
  // and the same peripheral) carry curvature ±1; combined with the sibling
  // offset, this guarantees the two opposing arrows end up on opposite sides
  // of the centre line so they never overlap.
  const siblingCount = Math.max(1, edgeData.siblingCount ?? 1);
  const siblingIndex = edgeData.siblingIndex ?? 0;
  const offsetIndex = siblingIndex - (siblingCount - 1) / 2;
  const siblingPerp = offsetIndex * SIBLING_SPACING;
  const bidiPerp = (edgeData.curvature ?? 0) * BIDI_SPACING;
  const perpScale = siblingPerp + bidiPerp;
  let path: string;
  let labelX: number;
  let labelY: number;
  if (perpScale !== 0) {
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    // Rotate the path-direction unit vector 90° → perpendicular vector.
    const perpX = -uy;
    const perpY = ux;
    const cpx = mx + perpX * perpScale;
    const cpy = my + perpY * perpScale;
    path = `M ${sx},${sy} Q ${cpx},${cpy} ${tx},${ty}`;
    // P1 — repartir la etiqueta a lo largo de la curva según la posición de
    // la flecha dentro del grupo: la hermana 0 queda cerca del origen, la
    // última cerca del destino. Para 1 flecha (sin hermanas) cae al midpoint
    // clásico. Punto del Bézier cuadrático: B(t) = (1−t)² S + 2(1−t)t C + t² T.
    const normalizedIndex =
      siblingCount > 1 ? siblingIndex / (siblingCount - 1) - 0.5 : 0;
    const tLabel = 0.5 + normalizedIndex * LABEL_T_RANGE;
    const omt = 1 - tLabel;
    labelX = omt * omt * sx + 2 * omt * tLabel * cpx + tLabel * tLabel * tx;
    labelY = omt * omt * sy + 2 * omt * tLabel * cpy + tLabel * tLabel * ty;
  } else {
    const [straightPath, sLabelX, sLabelY] = getStraightPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
    });
    path = straightPath;
    labelX = sLabelX;
    labelY = sLabelY;
  }

  // Wall-clock animation. progress ∈ [0,1] is "how far through the draw
  // animation we should be at this exact moment, given when the connection
  // first arrived". On a fresh mount we initialise to the right progress;
  // we only run a rAF loop while we still have animating to do. Crucially,
  // if ReactFlow remounts the edge mid-stream, the new instance reads
  // firstSeenAt from data, recomputes progress (which by then is probably
  // already 1), and renders the final state — no flicker.
  // Fallback to 0 (epoch) when no firstSeenAt is supplied: that pushes
  // elapsed massively positive so progress jumps straight to 1 and the
  // line renders fully drawn. Falling back to Date.now() (which we used
  // before) made every render reset the anchor and pinned progress at 0
  // — the bug that hid all FocusMethodGraph edges, since that graph
  // wasn't passing firstSeenAt through edge data.
  const firstSeenAt = edgeData.firstSeenAt ?? 0;
  const arrivalIndex = edgeData.index ?? 0;
  const totalDelayMs =
    ANIM_DELAY_MS + Math.min(arrivalIndex, STAGGER_CAP_INDEX) * STAGGER_MS;
  const computeProgress = () => {
    const elapsed = Date.now() - firstSeenAt - totalDelayMs;
    return Math.max(0, Math.min(1, elapsed / ANIM_DURATION_MS));
  };
  const [progress, setProgress] = useState(computeProgress);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (progress >= 1) return;
    const tick = () => {
      const p = computeProgress();
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSeenAt]);

  // Path inline style. opacity ramps to 1 at 20% of progress so the line
  // fades in fast then takes the rest of the duration to actually draw,
  // matching the keyframes the CSS version had.
  const dashOffset = 1500 * (1 - progress);
  // P4 — depth-2 edges clamp to 0.7 of the otherwise-computed opacity so
  // the radial pop of the depth-1 ring stays visually dominant.
  const opacity =
    Math.min(1, progress * 5) * (isDeepEdge ? 0.7 : 1);

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
    // P1 — primary label is the focus method that this caller invokes
    // ("save()" / "delete()"). Falls back to the caller-side via-label when
    // method resolution failed (legacy "via import" / structural cases).
    if (edgeData.viaMethodInTarget) {
      viaLabel = `${edgeData.viaMethodInTarget}()`;
    } else {
      viaLabel = edgeData.viaMethodInSource
        ? `via ${edgeData.viaMethodInSource}()`
        : "via import";
    }
    viaMethodName = edgeData.viaMethodInSource ?? null;
    const peripheral = focusConnections.find((c) => c.id === target);
    viaClassId = peripheral?.id ?? null;
    viaMethods = peripheral?.methods ?? [];
    // Body shown = peripheral's calling method. Mark where it touches focus.
    highlightClassName = focusClass?.name ?? null;
    highlightMethodName =
      ct === "INVOKES_METHOD" ? focusMethod?.methodName ?? null : null;
  } else if (ct === "CALLS") {
    // P1 — primary label is the peripheral method the focus invokes.
    // Falls back to the focus-side via-label when not resolvable.
    if (edgeData.viaMethodInTarget) {
      viaLabel = `${edgeData.viaMethodInTarget}()`;
    } else {
      viaLabel = edgeData.viaMethodInSource
        ? `desde ${edgeData.viaMethodInSource}()`
        : "desde uso interno";
    }
    viaMethodName = edgeData.viaMethodInSource ?? null;
    viaClassId = focusClass?.id ?? null;
    viaMethods = focusClass?.methods ?? [];
    // Body shown = focus's calling method. Mark where it touches peripheral.
    const peripheral = focusConnections.find((c) => c.id === target);
    highlightClassName = peripheral?.name ?? null;
    highlightMethodName = edgeData.viaMethodInTarget ?? null;
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
        style={{ color: style.stroke }}
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
            strokeDashoffset: dashOffset,
            opacity,
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
          <div className="flex items-center gap-1">
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
            {/* P3 — semantic-kind icon. Mounted in the label band so hover
                target stays close to the connection-type chip. Native title
                tooltip in Spanish: "Invoca métodos" / "Crea instancias" /
                "Inyección sin invocación" / "Solo declaración de tipo". */}
            <ReferenceKindIcon kind={edgeData.referenceKind ?? null} />
          </div>
          {edgeData.aggregatedMethods && edgeData.aggregatedMethods.length > 1 ? (
            <span
              data-testid="aggregated-methods-badge"
              title={edgeData.aggregatedMethods.join("\n")}
              style={{ pointerEvents: "auto" }}
              className="rounded-sm border border-[var(--bordo)] bg-[var(--bordo)]/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold leading-none tracking-tight text-[var(--bordo)]"
            >
              +{edgeData.aggregatedMethods.length} métodos
            </span>
          ) : viaLabel ? (
            viaClickable ? (
              <button
                type="button"
                onClick={handleViaClick}
                data-testid="focus-edge-via-label"
                style={{ pointerEvents: "auto" }}
                className="group flex items-center gap-1 rounded-sm border border-[var(--border-silver)] bg-[var(--bg-base)]/95 px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-tight text-[var(--silver-mid)] transition-colors hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bordo)]/60 cursor-pointer"
                title="Ver código en la sheet"
              >
                <span>{viaLabel}</span>
                <ChevronRight className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            ) : (
              <span
                data-testid="focus-edge-via-label"
                className="rounded-sm border border-[var(--border-silver)] bg-[var(--bg-base)]/95 px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-tight text-[var(--silver-mid)]"
              >
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
