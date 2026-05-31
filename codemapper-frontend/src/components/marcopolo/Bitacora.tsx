"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import { useGraphInteraction } from "@/hooks/useGraphInteraction";
import {
  ArrowLeft,
  Clock,
  Download,
  ExternalLink,
  GripHorizontal,
  History,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useBitacoraStore } from "@/store/bitacoraStore";
import { BitacoraNode } from "./BitacoraNode";
import { BitacoraEdge } from "./BitacoraEdge";

/** documentPictureInPicture — Chromium 116+ API. Not in the standard lib
 *  types yet, so declare the surface we use. The whole API is gated on
 *  feature detection (`"documentPictureInPicture" in window`) so this
 *  declaration just unblocks the TypeScript checker. */
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options?: {
        width?: number;
        height?: number;
        disallowReturnToOpener?: boolean;
        preferInitialWindowPlacement?: boolean;
      }) => Promise<Window>;
      window: Window | null;
    };
  }
}

/** Copy all styles from the main document into the PiP window's document
 *  so Tailwind classes, CSS vars, and our custom keyframes work there.
 *  Also propagates the theme className from <html>/<body> so the dark
 *  theme tokens resolve. */
function copyStylesToPip(pip: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const owner = sheet.ownerNode;
      if (owner instanceof HTMLLinkElement) {
        const link = pip.document.createElement("link");
        link.rel = "stylesheet";
        link.href = owner.href;
        pip.document.head.appendChild(link);
      } else if (owner instanceof HTMLStyleElement) {
        const style = pip.document.createElement("style");
        // cssRules can throw on CORS-restricted sheets — fall back to
        // textContent which CSSStyleSheet exposes for inline ones.
        style.textContent = Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join("\n");
        pip.document.head.appendChild(style);
      }
    } catch {
      // CORS-locked stylesheet (e.g. from a CDN) — silently skip.
    }
  }
  pip.document.documentElement.className = document.documentElement.className;
  pip.document.body.className = document.body.className;
  pip.document.body.style.margin = "0";
  pip.document.body.style.background = "var(--bg-base)";
  pip.document.body.style.color = "var(--fg-primary)";
  pip.document.body.style.minHeight = "100vh";
}

const NODE_TYPES = { bitacoraNode: BitacoraNode };
const EDGE_TYPES = { bitacoraEdge: BitacoraEdge };

const DEFAULT_W = 500;
const DEFAULT_H = 500;
const MIN_W = 360;
const MIN_H = 320;

/** Radial layout — origin at (0,0), other nodes evenly spaced around.
 *  Half-sizes match the rectangles in BitacoraNode (140×52 origen, 110×38
 *  visited) so the position offset centers each card on its slot. Ring
 *  radius bumped to accommodate the wider-than-tall cards without overlap. */
const ORIGIN_HALF_W = 70;
const ORIGIN_HALF_H = 26;
const VISITED_HALF_W = 55;
const VISITED_HALF_H = 19;
const RING_RADIUS = 200;

/**
 * Bitácora panel — a draggable, resizable, non-blocking modal that hosts
 * a small React Flow showing the user's navigation tree. The origin node
 * stays at the center; visited nodes orbit. Edges register every jump
 * the user has made via "Foco Scaner" / "Foco al Método" since the
 * current Marco Polo session began.
 *
 * The panel mounts once the bitácora has at least the origin AND the
 * user has toggled it open via BitacoraIndicator. Closing the panel
 * (X or click outside the chrome) only hides — the bitácora data
 * survives so reopening shows the same tree intact.
 */
export function Bitacora() {
  const isPanelOpen = useBitacoraStore((s) => s.isPanelOpen);
  const setPanelOpen = useBitacoraStore((s) => s.setPanelOpen);
  if (!isPanelOpen) return null;
  return (
    <ReactFlowProvider>
      <BitacoraInner onClose={() => setPanelOpen(false)} />
    </ReactFlowProvider>
  );
}

function BitacoraInner({ onClose }: { onClose: () => void }) {
  // The panel always reads the live tree from the store, but if
  // viewingArchivedId is set we swap to the matching archived snapshot.
  // That keeps the Bitacora component a single source of truth.
  const liveNodes = useBitacoraStore((s) => s.nodes);
  const liveEdges = useBitacoraStore((s) => s.edges);
  const liveActiveNodeId = useBitacoraStore((s) => s.activeNodeId);
  const liveOrigenId = useBitacoraStore((s) => s.origenId);
  const viewingArchivedId = useBitacoraStore((s) => s.viewingArchivedId);
  const archived = useBitacoraStore((s) => s.archived);
  const closeArchivedView = useBitacoraStore((s) => s.closeArchivedView);

  const archivedTree = viewingArchivedId
    ? archived.find((t) => t.id === viewingArchivedId) ?? null
    : null;
  const isHistorical = archivedTree !== null;
  const nodes = archivedTree ? archivedTree.nodes : liveNodes;
  const edges = archivedTree ? archivedTree.edges : liveEdges;
  // No "active" highlight in historical mode — it isn't meaningful for a
  // frozen snapshot. Live mode keeps tracking the user's last position.
  const activeNodeId = archivedTree ? null : liveActiveNodeId;
  const origenId = archivedTree ? archivedTree.origenId : liveOrigenId;

  // ── Document Picture-in-Picture ─────────────────────────────────────
  // When the user requests it, we move the panel content into a real OS
  // window via the PiP API. While in PiP the in-page panel disappears
  // (the portal target is the PiP doc) and the dragging/positioning UI
  // is hidden — the OS handles those natively. Closing the PiP window
  // returns control to the in-page panel.
  //
  // The active PiP Window object is held in the store (NOT local state)
  // so it survives any React tree remount. Otherwise, navigating to
  // another focus class via "Foco Scaner" would close the PiP every
  // time the page re-renders — the user explicitly didn't want that.
  const pipWindow = useBitacoraStore((s) => s.pipWindow);
  const setPipWindow = useBitacoraStore((s) => s.setPipWindow);
  const isPipSupported =
    typeof window !== "undefined" && "documentPictureInPicture" in window;
  // Maximize toggle. In-page: panel fills the viewport. In PiP: resize
  // the OS window to fill the screen. Ephemeral state — we don't persist
  // because it's a "current view" preference, not a layout choice.
  const [isMaximized, setIsMaximized] = useState(false);

  const openPip = useCallback(async () => {
    if (!isPipSupported || !window.documentPictureInPicture) return;
    try {
      // Chrome's Document-PiP caps requestWindow dimensions internally
      // (around half-screen no matter what we pass), so asking for the
      // moon doesn't help. Open at a sensible workspace size; the user
      // gets a "Maximizar" button in the panel that triggers
      // requestFullscreen on the PiP doc — which DOES fill the screen.
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 900,
        height: 700,
      });
      copyStylesToPip(pip);
      pip.addEventListener("pagehide", () => setPipWindow(null), {
        once: true,
      });
      setPipWindow(pip);
    } catch (err) {
      console.error("[CodeMapper] PiP open failed", err);
      toast.error("No se pudo abrir la ventana flotante");
    }
  }, [isPipSupported]);

  // Note: we deliberately do NOT auto-close the PiP when the React
  // component unmounts. Next.js soft navigations (e.g. Foco Scaner)
  // unmount/remount the tree, and closing the PiP on every nav was
  // exactly what frustrated the user. The PiP only closes on explicit
  // user actions: "Volver al explorador" chip, the OS X on the PiP
  // itself, or the panel's full-close X (handled below in onClose).

  // Drag state — track delta from initial pointer down. We avoid
  // react-draggable to keep zero new deps; manual pointer handling is ~20
  // lines and reuses the existing bg/border tokens.
  // Initialize from the store-persisted position so close → reopen lands
  // in the same spot the user left it. Falls back to top-right corner on
  // first ever open (panelPos is null until first drag).
  const persistedPos = useBitacoraStore((s) => s.panelPos);
  const setPersistedPos = useBitacoraStore((s) => s.setPanelPos);
  const [pos, setPos] = useState(
    persistedPos ?? {
      x: typeof window !== "undefined" ? window.innerWidth - DEFAULT_W - 24 : 24,
      y: 96,
    },
  );
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest("[data-drag-handle]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: pos.x,
      baseY: pos.y,
    };
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: Math.max(0, dragRef.current.baseX + dx),
      y: Math.max(0, dragRef.current.baseY + dy),
    });
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    // Persist the final resting position so the panel reappears here on
    // next open (or after a tab reload — sessionStorage carries it).
    setPersistedPos(pos);
  };

  // Build React Flow nodes + edges from the store. Layout: origen at
  // (0,0), visited nodes evenly spaced on a ring of RING_RADIUS. As N
  // grows the ring gets crowded — leave that for a v2 (multi-ring).
  const { rfNodes: computedNodes, rfEdges: computedEdges } = useMemo(() => {
    const others = nodes.filter((n) => !n.isOrigen);
    const N = Math.max(others.length, 1);
    const rfNodes: Node[] = [];

    const origen = nodes.find((n) => n.isOrigen);
    if (origen) {
      rfNodes.push({
        id: origen.id,
        type: "bitacoraNode",
        position: { x: -ORIGIN_HALF_W, y: -ORIGIN_HALF_H },
        data: {
          className: origen.className,
          isOrigen: true,
          isActive: origen.id === activeNodeId,
        },
        draggable: false,
        selectable: false,
      });
    }

    others.forEach((n, i) => {
      const angle = -Math.PI / 2 + (i / N) * 2 * Math.PI;
      const cx = RING_RADIUS * Math.cos(angle);
      const cy = RING_RADIUS * Math.sin(angle);
      rfNodes.push({
        id: n.id,
        type: "bitacoraNode",
        position: { x: cx - VISITED_HALF_W, y: cy - VISITED_HALF_H },
        data: {
          className: n.className,
          isOrigen: false,
          isActive: n.id === activeNodeId,
        },
        draggable: false,
        selectable: false,
      });
    });

    // For each source/target pair, count how many edges share it so the
    // edge component knows its parallel index and can offset its curve.
    const pairKey = (s: string, t: string) => `${s}→${t}`;
    const totalsByPair = new Map<string, number>();
    const indexByPair = new Map<string, number>();
    for (const e of edges) {
      totalsByPair.set(
        pairKey(e.source, e.target),
        (totalsByPair.get(pairKey(e.source, e.target)) ?? 0) + 1,
      );
    }

    const rfEdges: Edge[] = edges.map((e) => {
      const key = pairKey(e.source, e.target);
      const idx = indexByPair.get(key) ?? 0;
      indexByPair.set(key, idx + 1);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "bitacoraEdge",
        data: {
          fromMethod: e.fromMethod,
          toMethod: e.toMethod,
          isLatest: e.isLatest,
          parallelIndex: idx,
          parallelCount: totalsByPair.get(key) ?? 1,
          // Click handler: in live mode, move the active marker to the
          // edge's target. In historical mode, show a toast — the
          // archived tree is read-only by design.
          onSelect: () => {
            if (isHistorical) {
              toast.info("Modo histórico — solo lectura");
              return;
            }
            useBitacoraStore.getState().setActive(e.target);
          },
        },
      };
    });

    return { rfNodes, rfEdges };
  }, [nodes, edges, activeNodeId, isHistorical]);

  const {
    nodes: rfNodes,
    edges: rfEdges,
    onNodesChange,
    onEdgesChange,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    shouldAutoFit,
  } = useGraphInteraction(computedNodes, computedEdges);

  // Frame the tree on first render and whenever the node count changes —
  // unless the user has taken manual control of the view.
  const flowRef = useRef<HTMLDivElement | null>(null);
  const { fitView } = useReactFlow();
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!shouldAutoFit()) return;
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      if (shouldAutoFit()) fitView({ duration: 350, padding: 0.18 });
    }, 80);
  }, [fitView, computedNodes.length, shouldAutoFit]);

  const onExport = useCallback(async () => {
    const target = flowRef.current?.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!target) {
      toast.error("No se pudo capturar el árbol");
      return;
    }
    try {
      // Frame the tree before capturing so the PNG includes everything,
      // not just what's visible in the panel viewport.
      fitView({ padding: 0.12, duration: 0 });
      // Wait one paint so React Flow has applied the new transform.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const dataUrl = await toPng(target, {
        backgroundColor: "#0A0A0A",
        pixelRatio: 2,
      });
      const today = new Date().toISOString().slice(0, 10);
      const safeName = (origenId ?? "arbol").replace(/[^A-Za-z0-9._-]/g, "_");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `arbol-${safeName}-${today}.png`;
      link.click();
    } catch (err) {
      console.error("[CodeMapper] bitácora PNG export failed", err);
      toast.error("No se pudo exportar el árbol");
    }
  }, [fitView, origenId]);

  const inPip = pipWindow !== null;

  // Toggle: maximize the panel.
  //  • In-page mode → cover the browser viewport (CSS-driven).
  //  • PiP mode → request real OS fullscreen on the PiP document. Chrome
  //    silently caps Document-PiP `resizeTo` to ~half-screen, so calling
  //    requestFullscreen is the only way to actually fill the monitor.
  //    The Fullscreen API requires the call to originate from a user
  //    gesture inside the PiP window — the click handler that runs this
  //    function lives in the portaled panel inside the PiP, so the
  //    gesture qualifies.
  const toggleMaximize = useCallback(() => {
    if (inPip && pipWindow && !pipWindow.closed) {
      const doc = pipWindow.document;
      if (doc.fullscreenElement) {
        doc.exitFullscreen().catch(() => {});
      } else {
        doc.documentElement.requestFullscreen().catch((err) => {
          console.warn("[CodeMapper] PiP fullscreen blocked", err);
          // Fallback: try the resizeTo path. May still no-op but it's
          // cheap to attempt.
          try {
            pipWindow.moveTo(0, 0);
            pipWindow.resizeTo(
              pipWindow.screen.availWidth,
              pipWindow.screen.availHeight,
            );
          } catch {
            // Nothing else to try — the user can drag/resize manually.
          }
        });
      }
    }
    setIsMaximized((m) => !m);
  }, [inPip, pipWindow]);

  // Sync the toggle with the actual fullscreen state of the PiP doc, so
  // pressing Esc (which exits fullscreen) updates our button to "Maximize"
  // again instead of getting stuck on "Restore".
  useEffect(() => {
    if (!inPip || !pipWindow) return;
    const doc = pipWindow.document;
    const onFsChange = () => setIsMaximized(!!doc.fullscreenElement);
    doc.addEventListener("fullscreenchange", onFsChange);
    return () => doc.removeEventListener("fullscreenchange", onFsChange);
  }, [inPip, pipWindow]);

  // Note: we deliberately don't auto-reset isMaximized when toggling
  // PiP — openPip seeds it to true so the panel matches the screen-fill
  // initial PiP size, and if the user closes PiP back to in-page the
  // maximized state is the more useful default (they can click restore
  // anytime).

  // In PiP mode the outer chrome (fixed positioning, drag, resize) is
  // delegated to the OS window — we just need to fill the PiP body.
  // In-page maximize: cover the viewport instead of the floating box.
  const wrapperStyle: React.CSSProperties = inPip
    ? {
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }
    : isMaximized
      ? {
          position: "fixed",
          left: 0,
          top: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          zIndex: 60,
        }
      : {
          position: "fixed",
          left: pos.x,
          top: pos.y,
          width: DEFAULT_W,
          height: DEFAULT_H,
          minWidth: MIN_W,
          minHeight: MIN_H,
          resize: "both",
          overflow: "hidden",
          zIndex: 60,
        };

  // Drag is only meaningful in the floating in-page mode at its default
  // size. PiP delegates to the OS, maximized has no spare position.
  const dragDisabled = inPip || isMaximized;

  const panelContent = (
    <div
      onPointerDown={dragDisabled ? undefined : onDragStart}
      onPointerMove={dragDisabled ? undefined : onDragMove}
      onPointerUp={dragDisabled ? undefined : onDragEnd}
      onPointerCancel={dragDisabled ? undefined : onDragEnd}
      style={wrapperStyle}
      className="cm-hairline-top flex flex-col rounded-lg border border-[var(--bordo)]/40 bg-[var(--bg-card)] shadow-[var(--shadow-xl,0_25px_60px_rgba(0,0,0,0.7))]"
      role="dialog"
      aria-label="Árbol de Marco Polo"
    >
      {/* Drag handle / header. In PiP mode we drop the data-drag-handle
          attribute and the grab cursor — the OS window handles dragging. */}
      <div
        {...(dragDisabled ? {} : { "data-drag-handle": true })}
        className={`flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-silver)] bg-[var(--bg-panel)] px-3 py-2 ${
          dragDisabled ? "" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {!dragDisabled && (
            <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--silver-dark)]" />
          )}
          <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bordo)]">
            Árbol
          </span>
          <span className="truncate font-mono text-[10px] tabular-nums text-[var(--silver-mid)]">
            {origenId ? `· origen: ${origenId}` : ""}
          </span>
          {isHistorical && (
            <span className="flex shrink-0 items-center gap-1 rounded-sm border border-[var(--bordo)]/40 bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--bordo)]">
              <History className="h-2.5 w-2.5" />
              Histórico
            </span>
          )}
        </div>
        {/* Buttons swallow their own pointerdown so the outer drag handler
            doesn't capture the pointer (setPointerCapture there steals
            the click → the X never fires). Each button still stops the
            click from bubbling for safety. */}
        <div
          className="flex items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isHistorical && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeArchivedView();
              }}
              title="Volver al árbol actual"
              aria-label="Volver al árbol actual"
              className="flex h-6 items-center gap-1 rounded-sm border border-[var(--border-silver)] px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--silver)] transition-colors hover:border-[var(--bordo)] hover:text-[var(--bordo)]"
            >
              <ArrowLeft className="h-3 w-3" />
              Actual
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
            title="Exportar árbol a PNG"
            aria-label="Exportar árbol a PNG"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--silver-dark)] transition-colors hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)]"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {/* Document Picture-in-Picture trigger. Visible only when the
              browser supports the API and we're not already inside a PiP
              window (no nested PiP). Chromium 116+ (Chrome, Edge).
              Shown as a labelled chip — icon-only was too obscure. */}
          {!inPip && isPipSupported && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPip();
              }}
              title="Abrir en ventana flotante siempre-arriba"
              aria-label="Abrir en ventana flotante"
              className="flex h-6 items-center gap-1 rounded-sm border border-[var(--border-silver)] px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--silver)] transition-colors hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
            >
              <ExternalLink className="h-3 w-3" />
              Sacar afuera
            </button>
          )}
          {/* In PiP mode — explicit way back to the in-page panel.
              The X button also does this (closing the OS window fires
              pagehide → setPipWindow(null) → renders back in-page),
              but a chip with text label is way more discoverable. */}
          {inPip && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (pipWindow && !pipWindow.closed) pipWindow.close();
              }}
              title="Volver al panel dentro del navegador"
              aria-label="Volver al explorador"
              className="flex h-6 items-center gap-1 rounded-sm border border-[var(--border-silver)] px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--silver)] transition-colors hover:border-[var(--bordo)] hover:bg-[var(--bordo)]/10 hover:text-[var(--bordo)]"
            >
              <ArrowLeft className="h-3 w-3" />
              Volver al explorador
            </button>
          )}
          {/* Maximize toggle. In-page covers the full viewport; in PiP
              resizes the OS window to fill the screen. Reverts on second
              click. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMaximize();
            }}
            title={isMaximized ? "Restaurar tamaño" : "Maximizar"}
            aria-label={isMaximized ? "Restaurar tamaño" : "Maximizar"}
            aria-pressed={isMaximized}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--silver-dark)] transition-colors hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)]"
          >
            {isMaximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // Close the PiP first if it's open, then close the panel.
              // Order matters: pagehide on the PiP fires asynchronously
              // and clears pipWindow in the store, which is the right
              // sequence even if the panel re-mounts later.
              if (pipWindow && !pipWindow.closed) {
                pipWindow.close();
              }
              onClose();
            }}
            title="Cerrar panel"
            aria-label="Cerrar panel"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-[var(--silver-dark)] transition-colors hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* React Flow viewport */}
      <div ref={flowRef} className="relative flex-1 bg-[var(--bg-base)]">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          proOptions={{ hideAttribution: true }}
          minZoom={0.4}
          maxZoom={2}
          nodesDraggable
          nodesConnectable={false}
          panOnScroll
          zoomOnPinch
          fitView
          fitViewOptions={{ padding: 0.18 }}
          onMoveStart={onMoveStart}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1}
            color="rgba(192, 192, 200, 0.07)"
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );

  // When in PiP, render the panel into the PiP window's body via Portal.
  // The React tree stays connected — store, hooks, ReactFlowProvider all
  // keep working — but the DOM lives in the OS window.
  if (inPip && pipWindow) {
    return createPortal(panelContent, pipWindow.document.body);
  }
  return panelContent;
}
