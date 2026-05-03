"use client";

import { memo, useMemo, useState } from "react";
import { Handle, Position, useStore, type NodeProps } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDashed,
  CircleDot,
  Lock,
  Shapes,
} from "lucide-react";
import type { ClassKind, ClassNodeData } from "@/lib/types";
import { useGraphStore } from "@/store/graphStore";

const ANNOTATION_COLORS: Record<string, string> = {
  RestController: "bg-violet-600",
  Service: "bg-emerald-600",
  Repository: "bg-amber-600",
  Component: "bg-sky-600",
  Entity: "bg-pink-600",
  Configuration: "bg-orange-600",
  Controller: "bg-violet-500",
};

function pickHeaderColor(data: ClassNodeData): string {
  if (data.type === "INTERFACE") return "border-2 border-dashed border-zinc-500 bg-zinc-800";
  if (data.type === "ENUM") return "bg-rose-600";
  for (const ann of data.annotations ?? []) {
    const stripped = ann.replace(/^@/, "").split("(")[0];
    if (ANNOTATION_COLORS[stripped]) return ANNOTATION_COLORS[stripped];
  }
  return "bg-zinc-700";
}

function KindIcon({ kind }: { kind: ClassKind }) {
  switch (kind) {
    case "INTERFACE":
      return <CircleDashed className="h-4 w-4" />;
    case "ENUM":
      return <Shapes className="h-4 w-4" />;
    case "RECORD":
      return <CircleDot className="h-4 w-4" />;
    case "ABSTRACT_CLASS":
      return <Box className="h-4 w-4 italic" />;
    default:
      return <Box className="h-4 w-4" />;
  }
}

function VisibilityIcon({ modifiers }: { modifiers: string[] }) {
  if (modifiers.includes("private")) return <Lock className="h-3 w-3 text-zinc-500" />;
  if (modifiers.includes("protected")) return <Circle className="h-3 w-3 fill-amber-500 text-amber-500" />;
  return <Circle className="h-3 w-3 fill-emerald-500 text-emerald-500" />;
}

const MAX_VISIBLE = 5;
const MAX_ANN_VISIBLE = 4;
const COMPACT_ZOOM_THRESHOLD = 0.6;

interface CustomData extends Record<string, unknown> {
  classData: ClassNodeData;
}

function ClassNodeComponent({ data, id }: NodeProps) {
  const classData = (data as CustomData).classData;
  const selectNode = useGraphStore((s) => s.selectNode);
  // Narrow subscriptions: each instance only re-renders when ITS own
  // selection toggles, not when any other node is selected.
  const isSelected = useGraphStore((s) => s.selectedNodeId === id);
  const hideGettersSetters = useGraphStore(
    (s) => s.filters.hideGettersSetters,
  );
  // Zoom-driven detail level. Coarse boolean → only re-renders when
  // the threshold is crossed, not on every pan/zoom delta.
  const isCompact = useStore((s) => s.transform[2] < COMPACT_ZOOM_THRESHOLD);

  const [showAllFields, setShowAllFields] = useState(false);
  const [showAllMethods, setShowAllMethods] = useState(false);

  const visibleMethods = useMemo(() => {
    const m = classData.methods ?? [];
    if (!hideGettersSetters) return m;
    return m.filter((meth) => !/^(get|set|is)[A-Z]/.test(meth.name));
  }, [classData.methods, hideGettersSetters]);

  const fields = classData.fields ?? [];
  const headerColor = pickHeaderColor(classData);

  if (isCompact) {
    const primaryAnn = (classData.annotations ?? [])
      .map((a) => a.replace(/^@/, "").split("(")[0])[0];
    return (
      <div
        className={`group w-[180px] cursor-pointer overflow-hidden rounded-lg border shadow-md transition-shadow hover:shadow-xl ${
          isSelected ? "border-primary ring-2 ring-primary/40" : "border-border"
        }`}
        onClick={() => selectNode(id)}
      >
        <Handle type="target" position={Position.Top} className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
        <div className={`flex items-center gap-2 px-3 py-2 text-white ${headerColor}`}>
          <KindIcon kind={classData.type} />
          <span className="truncate text-sm font-semibold">{classData.name}</span>
        </div>
        {primaryAnn && (
          <div className="bg-card px-3 py-1.5 text-[10px] font-medium text-primary">
            @{primaryAnn}
          </div>
        )}
      </div>
    );
  }

  const fieldsToShow = showAllFields ? fields : fields.slice(0, MAX_VISIBLE);
  const methodsToShow = showAllMethods
    ? visibleMethods
    : visibleMethods.slice(0, MAX_VISIBLE);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      whileHover={{ scale: 1.02 }}
      className={`group w-[280px] cursor-pointer rounded-lg border bg-card text-card-foreground shadow-md transition-shadow hover:shadow-xl ${
        isSelected ? "border-primary ring-2 ring-primary/40" : "border-border"
      }`}
      onClick={() => selectNode(id)}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />

      <div
        className={`flex items-center gap-2 rounded-t-lg px-3 py-2 text-white ${headerColor}`}
      >
        <KindIcon kind={classData.type} />
        <span className="truncate text-sm font-semibold">{classData.name}</span>
        {classData.type === "ABSTRACT_CLASS" && (
          <span className="ml-auto text-[10px] uppercase opacity-80">abs</span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-3">
        {classData.annotations.length > 0 && (
          <AnnotationList annotations={classData.annotations} />
        )}

        <Section
          title="Campos"
          count={fields.length}
          expanded={showAllFields}
          onToggle={() =>
            fields.length > MAX_VISIBLE && setShowAllFields((v) => !v)
          }
          collapsible={fields.length > MAX_VISIBLE}
        >
          <AnimatePresence initial={false}>
            {fieldsToShow.map((f, i) => (
              <motion.div
                key={`${f.name}-${i}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={
                    f.modifiers.includes("private")
                      ? "text-zinc-400"
                      : "text-foreground"
                  }
                >
                  {f.name}
                </span>
                <span className="truncate text-zinc-500">: {f.type}</span>
                {f.annotations.length > 0 && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {!showAllFields && fields.length > MAX_VISIBLE && (
            <span className="text-[10px] text-muted-foreground">
              +{fields.length - MAX_VISIBLE} más
            </span>
          )}
        </Section>

        <Section
          title="Métodos"
          count={visibleMethods.length}
          expanded={showAllMethods}
          onToggle={() =>
            visibleMethods.length > MAX_VISIBLE && setShowAllMethods((v) => !v)
          }
          collapsible={visibleMethods.length > MAX_VISIBLE}
        >
          <AnimatePresence initial={false}>
            {methodsToShow.map((m, i) => (
              <motion.div
                key={`${m.name}-${m.parameters.map((p) => p.type).join(",")}-${i}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-center gap-2 text-xs ${
                  m.isAbstract ? "italic" : ""
                }`}
              >
                <VisibilityIcon modifiers={m.modifiers} />
                <span className="truncate">
                  {m.name}(): <span className="text-zinc-500">{m.returnType}</span>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {!showAllMethods && visibleMethods.length > MAX_VISIBLE && (
            <span className="text-[10px] text-muted-foreground">
              +{visibleMethods.length - MAX_VISIBLE} más
            </span>
          )}
        </Section>
      </div>

      <div className="truncate rounded-b-lg border-t border-border px-3 py-1.5 text-xs text-zinc-500">
        {classData.packageName || "(sin paquete)"}
      </div>
    </motion.div>
  );
}

function AnnotationList({ annotations }: { annotations: string[] }) {
  const visible = annotations.slice(0, MAX_ANN_VISIBLE);
  const remaining = annotations.length - MAX_ANN_VISIBLE;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((a, i) => (
        <span
          key={`${a}-${i}`}
          className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary"
        >
          {a.startsWith("@") ? a : `@${a}`}
        </span>
      ))}
      {remaining > 0 && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          +{remaining}
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  expanded,
  onToggle,
  collapsible,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  collapsible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (collapsible) onToggle();
        }}
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {collapsible &&
          (expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          ))}
        {title} <span className="opacity-60">({count})</span>
      </button>
      {children}
    </div>
  );
}

function areNodePropsEqual(prev: NodeProps, next: NodeProps) {
  if (prev.id !== next.id) return false;
  if (prev.selected !== next.selected) return false;
  const prevData = (prev.data as CustomData).classData;
  const nextData = (next.data as CustomData).classData;
  // classData reference is stable per-class until fields/methods change
  // (the store builds a new object only for the touched class).
  return prevData === nextData;
}

export const ClassNode = memo(ClassNodeComponent, areNodePropsEqual);
