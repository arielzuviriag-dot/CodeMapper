"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  type Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import { AlertOctagon, Info, Smartphone } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useGraphInteraction } from "@/hooks/useGraphInteraction";
import { SpreadControl } from "./SpreadControl";
import { ErrorReportPanel } from "./ErrorReportPanel";
import { buildClassChain } from "./exceptionChain";

const NODE_W = 250;
const NODE_H = 92;
const GAP_X = 480;
const GAP_Y = 200;

/* ============================================================
 * Ariadna — LINEAR exception flow. Reads from left to right:
 *   [📱 pantalla] → [Controller] → [Service] → … → [Causa raíz (FOCO)]
 * Mobile screens (if a RN project was loaded) hang to the left of the
 * controller they reach. The last class is the focus = "error puro".
 * ============================================================ */

function FlowClassNode({ data }: { data: Record<string, unknown> }) {
  const isFocus = Boolean(data.isFocus);
  return (
    <div
      style={{ width: NODE_W }}
      className={`relative flex flex-col gap-1 rounded-lg border px-3 py-2.5 font-mono shadow-[var(--shadow-md)] transition-colors ${
        isFocus
          ? "border-[var(--bordo)] bg-[var(--bordo)]/15 shadow-[0_0_22px_rgba(185,28,66,0.45)]"
          : "border-[var(--border-silver)] bg-[var(--bg-card)] hover:border-[var(--bordo)]/60"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-[var(--silver-dark)]" />
      <Handle type="source" position={Position.Right} className="!bg-[var(--bordo)]" />
      <div className="flex items-center gap-1.5">
        {isFocus && (
          <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-[var(--bordo)]" strokeWidth={2.4} />
        )}
        <span className="truncate text-[13px] font-semibold text-[var(--fg-primary)]">
          {String(data.simpleName)}
        </span>
      </div>
      <span className="truncate text-[11px] text-[var(--silver)]">
        {String(data.methodName)}()
        {Number(data.lineNumber) > 0 && (
          <span className="text-[var(--silver-dark)]"> ·L{String(data.lineNumber)}</span>
        )}
      </span>
      {isFocus && (
        <span className="mt-0.5 w-fit rounded-sm bg-[var(--bordo)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-white">
          Error puro
        </span>
      )}
    </div>
  );
}

function FlowScreenNode({ data }: { data: Record<string, unknown> }) {
  return (
    <div
      style={{ width: NODE_W }}
      className="relative flex flex-col gap-1 rounded-lg border border-[var(--silver)]/50 bg-[var(--bg-panel)] px-3 py-2.5 font-mono shadow-[var(--shadow-md)]"
    >
      <Handle type="source" position={Position.Right} className="!bg-[var(--silver)]" />
      <div className="flex items-center gap-1.5">
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-[var(--silver)]" />
        <span className="truncate text-[13px] font-semibold text-[var(--fg-primary)]">
          {String(data.screenName)}
        </span>
        <span className="ml-auto rounded-sm border border-[var(--silver)]/40 px-1 py-0.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-[var(--silver)]">
          Mobile
        </span>
      </div>
      <span className="truncate text-[11px] text-[var(--silver)]">
        {String(data.apiFunction)}()
      </span>
      <span className="truncate text-[10px] text-[var(--silver-dark)]">
        {String(data.method)} {String(data.path)}
      </span>
    </div>
  );
}

const NODE_TYPES = { flowClass: FlowClassNode, flowScreen: FlowScreenNode };

function ExceptionFlowInner() {
  const report = useGraphStore((s) => s.exceptionReport);
  const mobileOrigins = useGraphStore((s) => s.mobileOrigins);
  const openClassSheetAtMethod = useGraphStore((s) => s.openClassSheetAtMethod);
  const openMobileFile = useGraphStore((s) => s.openMobileFile);
  const { fitView, getNode, setCenter } = useReactFlow();

  const { nodes: computedNodes, edges: computedEdges } = useMemo<{
    nodes: Node[];
    edges: Edge[];
  }>(() => {
    if (!report) return { nodes: [], edges: [] };
    const chain = buildClassChain(report.causes);
    if (chain.length === 0) return { nodes: [], edges: [] };

    // Unique node id per chain step (a class can recur on different lines).
    const seen = new Set<string>();
    const idForIndex: string[] = chain.map((f, i) => {
      const base = f.classId ?? `frame-${i}`;
      if (!seen.has(base)) {
        seen.add(base);
        return base;
      }
      return `${base}__${i}`;
    });

    const chainNodes: Node[] = chain.map((f, i) => ({
      id: idForIndex[i],
      type: "flowClass",
      position: { x: i * GAP_X, y: 0 },
      width: NODE_W,
      height: NODE_H,
      draggable: false,
      data: {
        kind: "class",
        classId: f.classId,
        simpleName: f.simpleName,
        methodName: f.methodName,
        lineNumber: f.lineNumber,
        isFocus: i === chain.length - 1,
      },
    }));

    const chainEdges: Edge[] = [];
    for (let i = 0; i < chain.length - 1; i++) {
      chainEdges.push({
        id: `edge-${i}`,
        source: idForIndex[i],
        target: idForIndex[i + 1],
        type: "smoothstep",
        animated: true,
        style: { stroke: "var(--bordo)", strokeWidth: 2 },
      });
    }

    // Mobile screens: hang to the left of the controller they reach. Group by
    // the chain index whose classId matches attachClassId.
    const screenNodes: Node[] = [];
    const screenEdges: Edge[] = [];
    const byAttach = new Map<string, typeof mobileOrigins>();
    for (const o of mobileOrigins) {
      const arr = byAttach.get(o.attachClassId) ?? [];
      arr.push(o);
      byAttach.set(o.attachClassId, arr);
    }
    byAttach.forEach((origins, attachClassId) => {
      const idx = chain.findIndex((f) => f.classId === attachClassId);
      if (idx < 0) return;
      const targetId = idForIndex[idx];
      const baseX = idx * GAP_X - GAP_X;
      const n = origins.length;
      origins.forEach((o, k) => {
        const sid = `mobile-${attachClassId}-${k}`;
        screenNodes.push({
          id: sid,
          type: "flowScreen",
          position: { x: baseX, y: (k - (n - 1) / 2) * GAP_Y },
          width: NODE_W,
          height: NODE_H,
          draggable: false,
          data: {
            kind: "screen",
            screenName: o.screenName,
            screenFile: o.screenFile,
            apiFunction: o.apiFunction,
            method: o.method,
            path: o.path,
          },
        });
        screenEdges.push({
          id: `medge-${sid}`,
          source: sid,
          target: targetId,
          type: "smoothstep",
          animated: true,
          label: `${o.method} ${o.path}`,
          labelStyle: { fill: "var(--silver)", fontSize: 10, fontFamily: "monospace" },
          labelBgStyle: { fill: "var(--bg-card)" },
          style: { stroke: "var(--silver)", strokeWidth: 1.5, strokeDasharray: "5 3" },
        });
      });
    });

    return {
      nodes: [...screenNodes, ...chainNodes],
      edges: [...chainEdges, ...screenEdges],
    };
  }, [report, mobileOrigins]);

  const {
    nodes: rfNodes,
    edges: rfEdges,
    onNodesChange,
    onEdgesChange,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    onNodeClick,
    onNodeDoubleClick,
    onPaneClick,
    shouldAutoFit,
    spreadNodes,
  } = useGraphInteraction(computedNodes, computedEdges, (node) => {
    const data = node.data as Record<string, unknown>;
    if (data.kind === "class") {
      const cid = String(data.classId ?? "");
      const m = (data.methodName as string) ?? null;
      const n = getNode(node.id);
      if (n) {
        setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, {
          zoom: 1.15,
          duration: 500,
        });
      }
      if (cid) openClassSheetAtMethod(cid, m);
    } else if (data.kind === "screen") {
      openMobileFile(String(data.screenFile), String(data.screenName));
    }
  });

  useEffect(() => {
    if (!shouldAutoFit()) return;
    const t = setTimeout(() => {
      if (shouldAutoFit()) fitView({ duration: 600, padding: 0.2, maxZoom: 1.1 });
    }, 200);
    return () => clearTimeout(t);
  }, [fitView, computedNodes.length, shouldAutoFit]);

  return (
    <div className="flex h-full w-full bg-[var(--bg-base)]">
      {/* Informe en columna fija (no overlay) — así el canvas y el primer
          vagón (la pantalla mobile, a la izquierda) nunca quedan tapados. */}
      <aside className="w-[400px] shrink-0 overflow-y-auto border-r border-[var(--border-silver)] bg-[var(--bg-base)] p-3">
        <ErrorReportPanel />
      </aside>

      <div className="relative flex-1">
      {computedNodes.length === 0 ? (
        report ? (
          <NoUserCodeCard
            type={report.topExceptionType}
            message={report.topExceptionMessage}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
              Construyendo el tren de la excepción...
            </span>
          </div>
        )
      ) : (
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={2}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          onMoveStart={onMoveStart}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1}
            color="rgba(192, 192, 200, 0.08)"
          />
          <Controls showInteractive={false} />
          <SpreadControl onSpread={spreadNodes} />
        </ReactFlow>
      )}
      </div>
    </div>
  );
}

/** Shown when the trace has no class from the user's project (e.g. a pure
 *  library/SDK crash like Firebase, or a build/config error). We still surface
 *  the exception type + message so the dev can act on it. */
function NoUserCodeCard({ type, message }: { type: string; message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex max-w-[560px] flex-col gap-3 rounded-lg border border-[var(--border-silver)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-[var(--silver)]" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--silver)]">
            Sin código de tu proyecto en el trace
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="break-words font-mono text-sm font-semibold text-[var(--bordo)]">
            {type}
          </span>
          {message && (
            <span className="break-words font-mono text-[12px] leading-snug text-[var(--silver)]">
              {message}
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--fg-secondary)]">
          Todos los frames son de librerías/SDK o del runtime (no aparece ninguna
          clase de los proyectos cargados). Suele ser un{" "}
          <span className="text-[var(--bordo)]">error de configuración/build</span>{" "}
          (ej. un plugin de Gradle/Firebase faltante) — la solución casi siempre
          está en el propio mensaje de arriba.
        </p>
      </div>
    </div>
  );
}

export function ExceptionFlowGraph() {
  return (
    <ReactFlowProvider>
      <ExceptionFlowInner />
    </ReactFlowProvider>
  );
}
