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
  Coffee,
  Globe,
  Lock,
  Shapes,
  Smartphone,
} from "lucide-react";
import type { ClassKind, ClassNodeData } from "@/lib/types";
import { useGraphStore } from "@/store/graphStore";

/* ============================================================
 * Header colors per Spring annotation.
 * Strict semantic mapping — uses inline style with the exact
 * hex values requested by the design system.
 *   @RestController → bordó vibrante  #B91C42
 *   @Service        → plata clásica   #C0C0C8 (text becomes black)
 *   @Repository     → bordó oscuro    #5C0A1A
 *   @Component      → gris azulado    #4A5568
 *   @Entity         → bordó medio     #8B0F2A
 *   @Configuration  → plata medio     #A8A8B0 (text becomes black)
 *   @Controller     → alias de RestController
 * ============================================================ */
interface HeaderTheme {
  bg: string;
  fg: string;
  border?: string;
}

const ANNOTATION_THEMES: Record<string, HeaderTheme> = {
  RestController: { bg: "#B91C42", fg: "#F5F5F5" },
  Controller:     { bg: "#B91C42", fg: "#F5F5F5" },
  Service:        { bg: "#C0C0C8", fg: "#0A0A0A" },
  Repository:     { bg: "#5C0A1A", fg: "#F5F5F5" },
  Component:      { bg: "#4A5568", fg: "#F5F5F5" },
  Entity:         { bg: "#8B0F2A", fg: "#F5F5F5" },
  Configuration:  { bg: "#A8A8B0", fg: "#0A0A0A" },
};

const DEFAULT_THEME: HeaderTheme = { bg: "#1F1F1F", fg: "#F5F5F5" };
const ENUM_THEME: HeaderTheme = { bg: "#8B0F2A", fg: "#F5F5F5" };
const INTERFACE_THEME: HeaderTheme = {
  bg: "#141414",
  fg: "#C0C0C8",
  border: "1px dashed #C0C0C8",
};
/** Front-end screen — classic "internet blue" so the web layer reads apart
 *  from every Java (bordó/silver) card at a glance. */
const WEB_THEME: HeaderTheme = { bg: "#2F81F7", fg: "#F5F5F5" };
/** Mobile screen — emerald, distinct from web blue and Java bordó. */
const MOBILE_THEME: HeaderTheme = { bg: "#0F9D58", fg: "#F5F5F5" };

function pickHeaderTheme(data: ClassNodeData): HeaderTheme {
  if (data.type === "WEB_SCREEN") return WEB_THEME;
  if (data.type === "MOBILE_SCREEN") return MOBILE_THEME;
  if (data.type === "INTERFACE") return INTERFACE_THEME;
  if (data.type === "ENUM") return ENUM_THEME;
  for (const ann of data.annotations ?? []) {
    const stripped = ann.replace(/^@/, "").split("(")[0];
    if (ANNOTATION_THEMES[stripped]) return ANNOTATION_THEMES[stripped];
  }
  return DEFAULT_THEME;
}

/** The stack marker the user asked for: 🌐 globe = web, 📱 phone = mobile,
 *  ☕ coffee = Java. Shown on every card so you read the layer at a glance. */
function StackBadge({ kind }: { kind: ClassKind }) {
  if (kind === "WEB_SCREEN") return <Globe className="h-4 w-4" />;
  if (kind === "MOBILE_SCREEN") return <Smartphone className="h-4 w-4" />;
  return <Coffee className="h-4 w-4" />;
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
  if (modifiers.includes("private"))
    return <Lock className="h-3 w-3 text-[var(--fg-muted)]" />;
  if (modifiers.includes("protected"))
    return <Circle className="h-3 w-3 fill-[var(--warning)] text-[var(--warning)]" />;
  return <Circle className="h-3 w-3 fill-[var(--success)] text-[var(--success)]" />;
}

const MAX_VISIBLE = 5;
const MAX_ANN_VISIBLE = 4;
const COMPACT_ZOOM_THRESHOLD = 0.6;

interface CustomData extends Record<string, unknown> {
  classData: ClassNodeData;
}

function ClassNodeComponent({ data, id }: NodeProps) {
  const classData = (data as CustomData).classData;
  const isSelected = useGraphStore((s) => s.selectedNodeId === id);
  const hideGettersSetters = useGraphStore((s) => s.filters.hideGettersSetters);
  const isCompact = useStore((s) => s.transform[2] < COMPACT_ZOOM_THRESHOLD);

  const [showAllFields, setShowAllFields] = useState(false);
  const [showAllMethods, setShowAllMethods] = useState(false);

  const visibleMethods = useMemo(() => {
    const m = classData.methods ?? [];
    if (!hideGettersSetters) return m;
    return m.filter((meth) => !/^(get|set|is)[A-Z]/.test(meth.name));
  }, [classData.methods, hideGettersSetters]);

  const fields = classData.fields ?? [];
  const theme = pickHeaderTheme(classData);

  const baseClass =
    "group cursor-pointer rounded-md border bg-[var(--bg-card)] text-[var(--fg-primary)] shadow-[var(--shadow-md)] transition-all hover:shadow-[var(--shadow-lg)]";
  const selectedClass = isSelected
    ? "border-[var(--bordo)] ring-2 ring-[var(--bordo)]/40"
    : "border-[var(--border-silver)]";

  // Front-end screen — a dedicated compact card (no Java fields/methods),
  // marked with its stack icon + color so it never reads as a Java class.
  // Click opens the source/simulate/elements viewer (see CodeGraph).
  if (classData.type === "WEB_SCREEN" || classData.type === "MOBILE_SCREEN") {
    const isMobile = classData.type === "MOBILE_SCREEN";
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        whileHover={{ scale: 1.02 }}
        className={`${baseClass} ${selectedClass} w-[240px]`}
      >
        <Handle type="target" position={Position.Top} className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
        <div
          className="flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-semibold"
          style={{ backgroundColor: theme.bg, color: theme.fg }}
        >
          {isMobile ? (
            <Smartphone className="h-4 w-4" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          <span className="truncate">{classData.name}</span>
          <span className="ml-auto text-[10px] uppercase tracking-[0.16em] opacity-80">
            {isMobile ? "mobile" : "web"}
          </span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: theme.bg }}
          >
            {isMobile ? "Front-end mobile" : "Front-end web"} · ver código
          </span>
          <span className="break-all font-mono text-[11px] leading-snug text-[var(--fg-secondary)]">
            {classData.fullyQualifiedName || classData.filePath}
          </span>
        </div>
      </motion.div>
    );
  }

  if (isCompact) {
    const primaryAnn = (classData.annotations ?? [])
      .map((a) => a.replace(/^@/, "").split("(")[0])[0];
    return (
      <div className={`${baseClass} ${selectedClass} w-[180px] overflow-hidden`}>
        <Handle type="target" position={Position.Top} className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
        <div
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: theme.bg,
            color: theme.fg,
            border: theme.border,
          }}
        >
          <StackBadge kind={classData.type} />
          <KindIcon kind={classData.type} />
          <span className="truncate">{classData.name}</span>
        </div>
        {primaryAnn && (
          <div className="bg-[var(--bg-card)] px-3 py-1.5 font-mono text-[10px] font-medium tracking-tight text-[var(--bordo)]">
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
      className={`${baseClass} ${selectedClass} w-[280px]`}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />

      <div
        className="flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-semibold"
        style={{
          backgroundColor: theme.bg,
          color: theme.fg,
          border: theme.border,
        }}
      >
        <StackBadge kind={classData.type} />
        <KindIcon kind={classData.type} />
        <span className="truncate">{classData.name}</span>
        {classData.type === "ABSTRACT_CLASS" && (
          <span className="ml-auto text-[10px] uppercase tracking-[0.16em] opacity-80">
            abs
          </span>
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
                className="flex items-center gap-2 font-mono text-xs"
              >
                <span
                  className={
                    f.modifiers.includes("private")
                      ? "text-[var(--fg-muted)]"
                      : "text-[var(--fg-primary)]"
                  }
                >
                  {f.name}
                </span>
                <span className="truncate text-[var(--silver-dark)]">: {f.type}</span>
                {f.annotations.length > 0 && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--bordo)]" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {!showAllFields && fields.length > MAX_VISIBLE && (
            <span className="text-[10px] text-[var(--fg-muted)]">
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
                className={`flex items-center gap-2 font-mono text-xs ${
                  m.isAbstract ? "italic" : ""
                }`}
              >
                <VisibilityIcon modifiers={m.modifiers} />
                <span className="truncate">
                  {m.name}():{" "}
                  <span className="text-[var(--silver-dark)]">{m.returnType}</span>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {!showAllMethods && visibleMethods.length > MAX_VISIBLE && (
            <span className="text-[10px] text-[var(--fg-muted)]">
              +{visibleMethods.length - MAX_VISIBLE} más
            </span>
          )}
        </Section>
      </div>

      <div className="truncate rounded-b-md border-t border-[var(--border-silver)] bg-[var(--bg-input)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
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
          className="rounded-sm border border-[var(--bordo)]/30 bg-[var(--bordo)]/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-tight text-[var(--bordo)]"
        >
          {a.startsWith("@") ? a : `@${a}`}
        </span>
      ))}
      {remaining > 0 && (
        <span className="rounded-sm border border-[var(--border-silver)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">
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
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--silver-dark)]"
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
  return prevData === nextData;
}

export const ClassNode = memo(ClassNodeComponent, areNodePropsEqual);
