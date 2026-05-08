"use client";

import { create } from "zustand";
import type {
  ClassFoundPayload,
  ClassNodeData,
  Connection,
  ConnectionFoundPayload,
  FieldsParsedPayload,
  FocusClassLoadedPayload,
  FocusConnectionPayload,
  FocusMethodLoadedPayload,
  ImpactReport,
  MethodsParsedPayload,
  ParsedField,
  ParsedMethod,
  SheetMode,
  UnresolvedReferencePayload,
} from "@/lib/types";

/** F-deep — single diagnostic surface from the backend (body of the SSE
 *  payload, with the wrapper unwrapped). Drives DiagnosticsPanel. */
export type Diagnostic = UnresolvedReferencePayload["reference"];

export type SessionStatus =
  | "idle"
  | "loading"
  | "streaming"
  | "complete"
  | "error";

export interface FilterState {
  hideGettersSetters: boolean;
  annotationFilters: Record<string, boolean>;
  classTypeFilters: Record<string, boolean>;
  /** Toggle visibility of edges by their ConnectionType (extends, implements,
   *  composition, dependency_injection, annotation_usage). Toggled from the
   *  EdgeLegend panel; applied in CodeGraph's filter pass. */
  connectionTypeFilters: Record<string, boolean>;
  /** Toggle visibility of FOCO peripherals by their FocusConnectionType
   *  (CALLS / CALLED_BY / EXTENDS / IMPLEMENTS / USES_PROPERTIES /
   *  INVOKES_METHOD / INVOKES_OUTGOING). Applied in FocusGraph and
   *  FocusMethodGraph's filter passes. */
  focusConnectionTypeFilters: Record<string, boolean>;
  searchQuery: string;
}

export interface ProjectStats {
  totalClasses: number;
  totalConnections: number;
  parseStartTime: number;
  parseEndTime: number;
  projectName: string;
}

export interface LimitReachedState {
  /** Sticky: true once the FREE limit was hit at any point this session. */
  reached: boolean;
  /** Modal visibility — independent of `reached` so the banner can persist after dismiss. */
  modalOpen: boolean;
  limit: number;
  totalAvailable: number;
  parsed: number;
  message: string;
}

export type LimitReachedPayload = Omit<LimitReachedState, "modalOpen">;

interface GraphState {
  sessionId: string | null;
  nodes: Map<string, ClassNodeData>;
  edges: Connection[];
  selectedNodeId: string | null;
  filters: FilterState;
  sessionStatus: SessionStatus;
  stats: ProjectStats;
  userInteracted: boolean;
  packages: Set<string>;
  limitReached: LimitReachedState;
  /** True once the session is identified as a FOCUS analysis. */
  focusMode: boolean;
  /** Central class for FOCUS mode. */
  focusClass: FocusClassLoadedPayload | null;
  /** Level-1 dependencies streamed in arrival order. */
  focusConnections: FocusConnectionPayload[];
  /** Absolute project path used for the current analysis. Survives `reset()`
   *  so the FOCO SCANER button can reuse it across re-analyses. Set by the
   *  inputs that know the path (LocalPathInput, FocusInput). */
  projectPath: string | null;
  /** Drives which view the right-hand sheet renders. */
  sheetMode: SheetMode;
  selectedVariable: ParsedField | null;
  selectedMethod: ParsedMethod | null;
  /** Tokens to highlight inside the displayed method body when the method
   *  sheet was opened from a connection chip — typically the called method
   *  or the partner class. Cleared whenever the sheet is opened from a
   *  context that has no specific call site to mark. */
  methodSheetHighlight: { className?: string | null; methodName?: string | null } | null;
  /** Method-as-focus payload (FOCUS_METHOD mode). */
  focusMethod: FocusMethodLoadedPayload | null;
  focusMethodMode: boolean;
  /** True while a FOCO SCANER navigation is in flight (sheet → new session).
   *  The map page uses this flag to swap the full-screen loader for a smaller
   *  in-graph loader so the header + sidebar stay visible during the
   *  transition. Survives `reset()` so it can carry across the session change. */
  pendingReanalysis: boolean;
  /** Increments whenever the user clicks "Reset layout" in the FilterPanel.
   *  CodeGraph subscribes and re-runs dagre when the value changes. Decoupled
   *  from CodeGraph internals so the FilterPanel can live in the outer sidebar. */
  layoutResetTick: number;
  /** Incrementa en cada flush. Usalo como dep estable en lugar del Map/array. */
  version: number;
  /** True when the session is running in PRO mode (caps lifted). Driven by
   *  `?demoMode=pro` today; will be driven by real billing in productive
   *  release. Centralized here so any component (graph, modal, badge) can
   *  read the same source of truth instead of duplicating useState. */
  isPro: boolean;
  /** Major Java version detected from the project manifest, set when SSE
   *  emits `session_start`. Null when no manifest was parseable. Drives
   *  per-feature compatibility decisions and the JavaVersionBadge UI. */
  detectedJavaVersion: string | null;
  /** Toggle for F3 — when false (default) test peripherals are hidden from
   *  the focus graph so the runtime topology stays clean. Persisted in the
   *  store so the dev's preference survives view changes. */
  showTests: boolean;
  /** F4 — currently active "Simular cambio" report. Null when the dev hasn't
   *  triggered the simulation yet, or has dismissed it. When non-null, the
   *  graph applies the impact overlay (atenuación + highlights). */
  impactReport: ImpactReport | null;
  /** F4 — true while the impact request is in flight. Drives the loader on
   *  the simulate-change button so the user sees progress on slow projects. */
  impactLoading: boolean;
  /** Identifier of the help popover currently open, or null when no popover
   *  is visible. Centralized so opening one (Java badge, conexiones legend,
   *  tipos legend, sidebar foco glosario, etc.) auto-closes any other.
   *  Each consumer picks a stable string id and reads/writes through this. */
  openHelpPopover: string | null;
  /** F-deep — diagnostics streamed from the backend during deep body
   *  analysis. Reset on every new FOCO. Drives the DiagnosticsPanel. */
  diagnostics: Diagnostic[];

  setSessionId: (id: string | null) => void;
  addClass: (payload: ClassFoundPayload) => void;
  updateClassFields: (payload: FieldsParsedPayload) => void;
  updateClassMethods: (payload: MethodsParsedPayload) => void;
  addConnection: (payload: ConnectionFoundPayload) => void;

  addClassesBatch: (payloads: ClassFoundPayload[]) => void;
  updateClassesFieldsBatch: (updates: FieldsParsedPayload[]) => void;
  updateClassesMethodsBatch: (updates: MethodsParsedPayload[]) => void;
  addConnectionsBatch: (payloads: ConnectionFoundPayload[]) => void;
  addPackagesBatch: (names: string[]) => void;

  addPackage: (packageName: string) => void;
  selectNode: (id: string | null) => void;
  clearSelection: () => void;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  toggleAnnotationFilter: (annotation: string) => void;
  toggleClassTypeFilter: (kind: string) => void;
  toggleConnectionTypeFilter: (kind: string) => void;
  toggleFocusConnectionTypeFilter: (kind: string) => void;
  resetFilters: () => void;
  setStatus: (status: SessionStatus) => void;
  setStats: (stats: Partial<ProjectStats>) => void;
  setLimitReached: (limit: LimitReachedPayload) => void;
  openLimitReachedModal: () => void;
  dismissLimitReached: () => void;
  setFocusMode: (enabled: boolean) => void;
  setFocusClass: (focus: FocusClassLoadedPayload) => void;
  addFocusConnection: (conn: FocusConnectionPayload) => void;
  setProjectPath: (path: string | null) => void;
  setFocusMethodMode: (enabled: boolean) => void;
  setFocusMethod: (focus: FocusMethodLoadedPayload) => void;
  /** Open the sheet on a specific variable of a class node. */
  openVariableSheet: (classNodeId: string, field: ParsedField) => void;
  /** Open the sheet on a specific method of a class node. Optional `highlight`
   *  marks the line(s) inside the body that match either token in red. */
  openMethodSheet: (
    classNodeId: string,
    method: ParsedMethod,
    highlight?: { className?: string | null; methodName?: string | null } | null,
  ) => void;
  /** Open the class sheet with a highlight pointing at the import line of
   *  `focusClassName`. Used by the "via import" fallback chip — the dev
   *  jumps to the file and the import line is marked red so they see
   *  exactly where the dependency is declared. */
  openClassSheetWithImportHighlight: (
    classNodeId: string,
    focusClassName: string,
  ) => void;
  setPendingReanalysis: (pending: boolean) => void;
  triggerLayoutReset: () => void;
  markUserInteracted: () => void;
  resetUserInteraction: () => void;
  setIsPro: (pro: boolean) => void;
  setDetectedJavaVersion: (version: string | null) => void;
  setShowTests: (show: boolean) => void;
  setImpactReport: (report: ImpactReport | null) => void;
  setImpactLoading: (loading: boolean) => void;
  /** Open the popover identified by `id` and close any other open popover.
   *  Pass null to close all popovers explicitly. */
  setOpenHelpPopover: (id: string | null) => void;
  /** F-deep — append a new diagnostic to the list. Called by useSSE for
   *  every `unresolved_reference` event. */
  addDiagnostic: (d: Diagnostic) => void;
  reset: () => void;
}

const DEFAULT_FILTERS: FilterState = {
  hideGettersSetters: false,
  annotationFilters: {
    Service: true,
    Repository: true,
    RestController: true,
    Controller: true,
    Component: true,
    Entity: true,
    Configuration: true,
  },
  classTypeFilters: {
    CLASS: true,
    INTERFACE: true,
    ENUM: true,
    RECORD: true,
    ABSTRACT_CLASS: true,
  },
  connectionTypeFilters: {
    EXTENDS: true,
    IMPLEMENTS: true,
    COMPOSITION: true,
    DEPENDENCY_INJECTION: true,
    METHOD_CALL: true,
    ANNOTATION_USAGE: true,
  },
  focusConnectionTypeFilters: {
    CALLS: true,
    CALLED_BY: true,
    EXTENDS: true,
    IMPLEMENTS: true,
    USES_PROPERTIES: true,
    INVOKES_METHOD: true,
    INVOKES_OUTGOING: true,
  },
  searchQuery: "",
};

const DEFAULT_STATS: ProjectStats = {
  totalClasses: 0,
  totalConnections: 0,
  parseStartTime: 0,
  parseEndTime: 0,
  projectName: "",
};

const DEFAULT_LIMIT_REACHED: LimitReachedState = {
  reached: false,
  modalOpen: false,
  limit: 0,
  totalAvailable: 0,
  parsed: 0,
  message: "",
};

function buildClassNode(payload: ClassFoundPayload): ClassNodeData {
  return {
    id: payload.id,
    name: payload.name,
    fullyQualifiedName: payload.fullyQualifiedName,
    packageName: payload.packageName,
    type: payload.type,
    annotations: payload.annotations ?? [],
    filePath: payload.filePath,
    lineCount: payload.lineCount ?? 0,
    modifiers: payload.modifiers ?? [],
    fields: [],
    methods: [],
  };
}

/** Mirror a FOCUS payload into the regular `nodes` Map so the existing
 *  ClassDetailSheet (which keys off `selectedNodeId` → nodes.get) works
 *  for focus center + peripheral nodes without branching. */
function focusToClassNode(payload: FocusClassLoadedPayload): ClassNodeData {
  return {
    id: payload.id,
    name: payload.name,
    fullyQualifiedName: payload.fullyQualifiedName,
    packageName: payload.packageName,
    type: payload.type,
    annotations: payload.annotations ?? [],
    filePath: payload.sourceFile,
    lineCount: payload.lineCount ?? 0,
    modifiers: payload.modifiers ?? [],
    fields: payload.fields ?? [],
    methods: payload.methods ?? [],
  };
}

function focusConnToClassNode(payload: FocusConnectionPayload): ClassNodeData {
  return {
    id: payload.id,
    name: payload.name,
    fullyQualifiedName: payload.fullyQualifiedName,
    packageName: payload.packageName,
    type: payload.type,
    annotations: payload.annotations ?? [],
    filePath: payload.sourceFile,
    // FocusConnectionEvent doesn't carry lineCount; metrics show 0 for peripherals.
    lineCount: 0,
    modifiers: [],
    fields: payload.fields ?? [],
    methods: payload.methods ?? [],
  };
}

export const useGraphStore = create<GraphState>((set) => ({
  sessionId: null,
  nodes: new Map(),
  edges: [],
  selectedNodeId: null,
  filters: DEFAULT_FILTERS,
  sessionStatus: "idle",
  stats: DEFAULT_STATS,
  userInteracted: false,
  packages: new Set(),
  limitReached: DEFAULT_LIMIT_REACHED,
  focusMode: false,
  focusClass: null,
  focusConnections: [],
  projectPath: null,
  sheetMode: "class",
  selectedVariable: null,
  selectedMethod: null,
  methodSheetHighlight: null,
  focusMethod: null,
  focusMethodMode: false,
  pendingReanalysis: false,
  layoutResetTick: 0,
  version: 0,
  isPro: false,
  detectedJavaVersion: null,
  showTests: false,
  impactReport: null,
  impactLoading: false,
  openHelpPopover: null,
  diagnostics: [],

  setSessionId: (id) => set({ sessionId: id }),

  addClass: (payload) =>
    set((state) => {
      if (state.nodes.has(payload.id)) return state;
      const next = new Map(state.nodes);
      next.set(payload.id, buildClassNode(payload));
      return {
        nodes: next,
        version: state.version + 1,
        stats: { ...state.stats, totalClasses: next.size },
      };
    }),

  updateClassFields: (payload) =>
    set((state) => {
      const existing = state.nodes.get(payload.classId);
      if (!existing) return state;
      const next = new Map(state.nodes);
      next.set(payload.classId, {
        ...existing,
        fields: payload.fields as ParsedField[],
      });
      return { nodes: next, version: state.version + 1 };
    }),

  updateClassMethods: (payload) =>
    set((state) => {
      const existing = state.nodes.get(payload.classId);
      if (!existing) return state;
      const next = new Map(state.nodes);
      next.set(payload.classId, {
        ...existing,
        methods: payload.methods as ParsedMethod[],
      });
      return { nodes: next, version: state.version + 1 };
    }),

  addConnection: (payload) =>
    set((state) => {
      const dup = state.edges.some(
        (e) =>
          e.from === payload.from &&
          e.to === payload.to &&
          e.type === payload.type,
      );
      if (dup) return state;
      const edges = [...state.edges, payload];
      return {
        edges,
        version: state.version + 1,
        stats: { ...state.stats, totalConnections: edges.length },
      };
    }),

  addClassesBatch: (payloads) =>
    set((state) => {
      if (payloads.length === 0) return state;
      const next = new Map(state.nodes);
      let added = 0;
      for (const p of payloads) {
        if (next.has(p.id)) continue;
        next.set(p.id, buildClassNode(p));
        added++;
      }
      if (added === 0) return state;
      return {
        nodes: next,
        version: state.version + 1,
        stats: { ...state.stats, totalClasses: next.size },
      };
    }),

  updateClassesFieldsBatch: (updates) =>
    set((state) => {
      if (updates.length === 0) return state;
      const next = new Map(state.nodes);
      let touched = 0;
      for (const u of updates) {
        const existing = next.get(u.classId);
        if (!existing) continue;
        next.set(u.classId, { ...existing, fields: u.fields as ParsedField[] });
        touched++;
      }
      if (touched === 0) return state;
      return { nodes: next, version: state.version + 1 };
    }),

  updateClassesMethodsBatch: (updates) =>
    set((state) => {
      if (updates.length === 0) return state;
      const next = new Map(state.nodes);
      let touched = 0;
      for (const u of updates) {
        const existing = next.get(u.classId);
        if (!existing) continue;
        next.set(u.classId, {
          ...existing,
          methods: u.methods as ParsedMethod[],
        });
        touched++;
      }
      if (touched === 0) return state;
      return { nodes: next, version: state.version + 1 };
    }),

  addConnectionsBatch: (payloads) =>
    set((state) => {
      if (payloads.length === 0) return state;
      const seen = new Set<string>(
        state.edges.map((e) => `${e.from}|${e.to}|${e.type}`),
      );
      const additions: typeof state.edges = [];
      for (const p of payloads) {
        const k = `${p.from}|${p.to}|${p.type}`;
        if (seen.has(k)) continue;
        seen.add(k);
        additions.push(p);
      }
      if (additions.length === 0) return state;
      const edges = state.edges.concat(additions);
      return {
        edges,
        version: state.version + 1,
        stats: { ...state.stats, totalConnections: edges.length },
      };
    }),

  addPackagesBatch: (names) =>
    set((state) => {
      if (names.length === 0) return state;
      const next = new Set(state.packages);
      let added = 0;
      for (const n of names) {
        if (next.has(n)) continue;
        next.add(n);
        added++;
      }
      if (added === 0) return state;
      return { packages: next, version: state.version + 1 };
    }),

  addPackage: (packageName) =>
    set((state) => {
      if (state.packages.has(packageName)) return state;
      const next = new Set(state.packages);
      next.add(packageName);
      return { packages: next, version: state.version + 1 };
    }),

  // Selecting a node from the graph always lands on the "class" sheet view.
  // Variable/method drill-ins go through openVariableSheet / openMethodSheet.
  selectNode: (id) =>
    set({
      selectedNodeId: id,
      sheetMode: "class",
      selectedVariable: null,
      selectedMethod: null,
      methodSheetHighlight: null,
    }),
  clearSelection: () =>
    set({
      selectedNodeId: null,
      sheetMode: "class",
      selectedVariable: null,
      selectedMethod: null,
      methodSheetHighlight: null,
    }),

  updateFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),

  toggleAnnotationFilter: (annotation) =>
    set((state) => ({
      filters: {
        ...state.filters,
        annotationFilters: {
          ...state.filters.annotationFilters,
          [annotation]: !state.filters.annotationFilters[annotation],
        },
      },
    })),

  toggleClassTypeFilter: (kind) =>
    set((state) => ({
      filters: {
        ...state.filters,
        classTypeFilters: {
          ...state.filters.classTypeFilters,
          [kind]: !state.filters.classTypeFilters[kind],
        },
      },
    })),

  toggleConnectionTypeFilter: (kind) =>
    set((state) => ({
      filters: {
        ...state.filters,
        connectionTypeFilters: {
          ...state.filters.connectionTypeFilters,
          [kind]: !state.filters.connectionTypeFilters[kind],
        },
      },
    })),

  toggleFocusConnectionTypeFilter: (kind) =>
    set((state) => ({
      filters: {
        ...state.filters,
        focusConnectionTypeFilters: {
          ...state.filters.focusConnectionTypeFilters,
          [kind]: !state.filters.focusConnectionTypeFilters[kind],
        },
      },
    })),

  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  setStatus: (status) => set({ sessionStatus: status }),

  setStats: (stats) =>
    set((state) => ({ stats: { ...state.stats, ...stats } })),

  setLimitReached: (limit) =>
    set({ limitReached: { ...limit, modalOpen: true } }),

  openLimitReachedModal: () =>
    set((state) => ({ limitReached: { ...state.limitReached, modalOpen: true } })),

  dismissLimitReached: () =>
    set((state) => ({ limitReached: { ...state.limitReached, modalOpen: false } })),

  setFocusMode: (enabled) => set({ focusMode: enabled }),

  setFocusClass: (focus) => {
    // [debug] flagging while we stabilise focus mode — remove once stable
    console.log("[CodeMapper] setFocusClass called with:", focus);
    set((state) => {
      const nextNodes = new Map(state.nodes);
      nextNodes.set(focus.id, focusToClassNode(focus));
      return {
        focusMode: true,
        focusClass: focus,
        nodes: nextNodes,
        version: state.version + 1,
      };
    });
  },

  addFocusConnection: (conn) =>
    set((state) => {
      if (state.focusConnections.some((c) => c.id === conn.id)) return state;
      const nextNodes = new Map(state.nodes);
      // Always overwrite — peripheral data is the latest version of that node.
      nextNodes.set(conn.id, focusConnToClassNode(conn));
      return {
        focusConnections: [...state.focusConnections, conn],
        nodes: nextNodes,
        version: state.version + 1,
      };
    }),

  setProjectPath: (path) => set({ projectPath: path }),

  setFocusMethodMode: (enabled) => set({ focusMethodMode: enabled }),

  setFocusMethod: (focus) => {
    // [debug] flagging while we stabilise focus mode — remove once stable
    console.log("[CodeMapper] setFocusMethod called with:", focus);
    set((state) => ({
      focusMethodMode: true,
      focusMethod: focus,
      version: state.version + 1,
    }));
  },

  openVariableSheet: (classNodeId, field) =>
    set({
      selectedNodeId: classNodeId,
      sheetMode: "variable",
      selectedVariable: field,
      selectedMethod: null,
    }),

  openMethodSheet: (classNodeId, method, highlight = null) =>
    set({
      selectedNodeId: classNodeId,
      sheetMode: "method",
      selectedVariable: null,
      selectedMethod: method,
      methodSheetHighlight: highlight,
    }),

  openClassSheetWithImportHighlight: (classNodeId, focusClassName) =>
    set({
      selectedNodeId: classNodeId,
      sheetMode: "class",
      selectedVariable: null,
      selectedMethod: null,
      methodSheetHighlight: { className: focusClassName, methodName: null },
    }),

  setPendingReanalysis: (pending) => set({ pendingReanalysis: pending }),

  triggerLayoutReset: () =>
    set((state) => ({ layoutResetTick: state.layoutResetTick + 1 })),

  markUserInteracted: () => set({ userInteracted: true }),
  resetUserInteraction: () => set({ userInteracted: false }),

  setIsPro: (pro) => set({ isPro: pro }),
  setDetectedJavaVersion: (version) => set({ detectedJavaVersion: version }),
  setShowTests: (show) => set({ showTests: show }),
  setImpactReport: (report) => set({ impactReport: report }),
  setImpactLoading: (loading) => set({ impactLoading: loading }),
  setOpenHelpPopover: (id) => set({ openHelpPopover: id }),
  addDiagnostic: (d) =>
    set((state) => ({ diagnostics: [...state.diagnostics, d] })),

  // NOTE: `projectPath` and `pendingReanalysis` are intentionally NOT
  // cleared here. Both must survive the map page's reset() on session
  // change so the FOCO SCANER → reanalysis transition can chain without
  // losing context. Their lifecycle is owned by the inputs / home
  // (which set/clear them) and the map page (which clears
  // pendingReanalysis once the new graph starts streaming).
  reset: () =>
    set({
      sessionId: null,
      nodes: new Map(),
      edges: [],
      selectedNodeId: null,
      filters: DEFAULT_FILTERS,
      sessionStatus: "idle",
      stats: DEFAULT_STATS,
      userInteracted: false,
      packages: new Set(),
      limitReached: DEFAULT_LIMIT_REACHED,
      focusMode: false,
      focusClass: null,
      focusConnections: [],
      sheetMode: "class",
      selectedVariable: null,
      selectedMethod: null,
      methodSheetHighlight: null,
      focusMethod: null,
      focusMethodMode: false,
      layoutResetTick: 0,
      version: 0,
      // isPro NOT cleared — it reflects the user's plan/demo flag for this
      // browser session, not per-analysis state. detectedJavaVersion IS
      // cleared because it's per-project — the next session will repopulate.
      detectedJavaVersion: null,
      // Impact report is per-session — wipe so the next FOCO doesn't inherit
      // a stale overlay.
      impactReport: null,
      impactLoading: false,
      // Close any open help popover when the session resets.
      openHelpPopover: null,
      // F-deep — diagnostics are per-session.
      diagnostics: [],
    }),
}));
