"use client";

import { create } from "zustand";
import type {
  ClassFoundPayload,
  ClassNodeData,
  Connection,
  ConnectionFoundPayload,
  ExceptionReportPayload,
  FieldsParsedPayload,
  FocusClassLoadedPayload,
  FocusConnectionPayload,
  FocusMethodLoadedPayload,
  ImpactReport,
  MethodsParsedPayload,
  MobileOriginPayload,
  ParsedField,
  ParsedMethod,
  SheetMode,
  UnresolvedReferencePayload,
} from "@/lib/types";
import type { AnalyzeFocusResponse } from "@/lib/api";

/** Live POST that's flying to the backend while the user has already been
 *  navigated to the map screen. The map page consumes this when the URL
 *  sessionId is "pending" — it awaits the promise, then router.replace's
 *  to the real session URL. The point is to remove the "blank screen
 *  while we wait for the analyze POST" delay between clicking and seeing
 *  the streaming UI. */
export interface PendingAnalysis {
  promise: Promise<AnalyzeFocusResponse>;
  /** Short text shown in the loading screen ("Analizando User.java..."). */
  description: string;
  /** Mode the map should be in once we know the sessionId. */
  mode: "focus" | "focus-method" | "project" | "exception";
  /** Demo flag carried through so the redirect URL keeps it. */
  demo?: "pro";
  /** For FOCUS modes — the absolute project path the FOCO SCANER button
   *  needs once the user is already in the map. Persisted into the store
   *  by the analyzers; the map carries it over after the redirect. */
  projectPath?: string;
}

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
  /** Honest total of detected connections (P1 + P2). When `truncated`, this
   *  equals the FREE hard cap (200) and the UI renders "200+". */
  totalAvailable: number;
  parsed: number;
  message: string;
  /** True when P2 hit the FREE hard cap and stopped counting. UI shows "200+"
   *  because we don't know the real number — only that it's at least 200. */
  truncated: boolean;
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
  /** Live analyze POST that the home flow already navigated past. The map
   *  page reads this when the URL sessionId is the literal "pending"
   *  placeholder. Null at rest. */
  pendingAnalysis: PendingAnalysis | null;
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
  /** P1 — controls whether the focus graph renders one edge per (peripheral,
   *  invoked method) pair ("method", the default) or collapses them into a
   *  single edge per peripheral class with a "+N métodos" badge ("class").
   *  Toggled from the FocusConnectionLegend; consumed by FocusGraph. */
  edgeGrouping: "method" | "class";
  /** P2 — directional filter on top of the existing per-type checkboxes.
   *    "all"      → no extra mask (default).
   *    "incoming" → only show edges where the peripheral points AT the focus
   *                 (CALLED_BY, INVOKES_METHOD, EXTENDS, IMPLEMENTS).
   *    "outgoing" → only show edges where the focus points OUT of itself
   *                 (CALLS, INVOKES_OUTGOING, USES_PROPERTIES).
   *  Applied as an INTERSECTION with classTypeFilters and
   *  focusConnectionTypeFilters — never overrides them. Driven by the
   *  FocusDirectionFilter segmented control above the graph. */
  focusDirectionFilter: "all" | "incoming" | "outgoing";
  /** Ariadna — the structured exception report for an EXCEPTION-mode session.
   *  Null in every other mode. When set, FocusGraph mounts the ErrorReportPanel
   *  (Informe del error) with clickable links into the radial map. */
  exceptionReport: ExceptionReportPayload | null;
  /** Ariadna — true when this is an EXCEPTION-mode session. Drives rendering
   *  the linear exception flow graph instead of the radial FocusGraph. */
  exceptionMode: boolean;
  /** Ariadna — mobile (RN) screens that reach endpoints in the chain. Drives
   *  the screen nodes at the start of the flow. */
  mobileOrigins: MobileOriginPayload[];
  /** Ariadna — a mobile file open in the code viewer (path + display name),
   *  or null. Set when the dev clicks a mobile screen node/step. */
  mobileFile: { path: string; name: string } | null;

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
  /** Ariadna — open the class sheet and mark the lines that mention `methodName`
   *  (the frame's method) in red. Used by the Informe panel's clickable links
   *  so the dev lands on the exact spot the trace points to. */
  openClassSheetAtMethod: (
    classNodeId: string,
    methodName: string | null,
  ) => void;
  setPendingReanalysis: (pending: boolean) => void;
  triggerLayoutReset: () => void;
  markUserInteracted: () => void;
  resetUserInteraction: () => void;
  setIsPro: (pro: boolean) => void;
  setPendingAnalysis: (p: PendingAnalysis | null) => void;
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
  /** P1 — swap edge grouping between "method" (per invoked method, default)
   *  and "class" (collapsed by peripheral with a "+N métodos" badge). */
  setEdgeGrouping: (mode: "method" | "class") => void;
  /** Ariadna — set/clear the exception report (consumed by the Informe panel). */
  setExceptionReport: (report: ExceptionReportPayload | null) => void;
  setExceptionMode: (enabled: boolean) => void;
  setMobileOrigins: (origins: MobileOriginPayload[]) => void;
  /** Ariadna — open/close the mobile file code viewer. */
  openMobileFile: (path: string, name: string) => void;
  closeMobileFile: () => void;
  /** P2 — swap the directional filter between "all", "incoming" and
   *  "outgoing". Applied as an additional mask over the per-type filters. */
  setFocusDirectionFilter: (mode: "all" | "incoming" | "outgoing") => void;
  /** P4 — bulk-add a set of connections stamped with depth=2 and a parent
   *  FQN. Skips entries whose (id, viaMethodInTarget) already exists in
   *  the store so a double-click doesn't duplicate the sub-arc. */
  addFocusConnectionsWithDepth: (
    connections: FocusConnectionPayload[],
    depth: 1 | 2,
    parentFqn: string | null,
  ) => void;
  /** P4 — collapse a depth-2 expansion by removing every connection whose
   *  parentFqn matches. Idempotent. */
  removeFocusConnectionsByParent: (parentFqn: string) => void;
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
  truncated: false,
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
  pendingAnalysis: null,
  detectedJavaVersion: null,
  showTests: false,
  impactReport: null,
  impactLoading: false,
  openHelpPopover: null,
  diagnostics: [],
  edgeGrouping: "method",
  focusDirectionFilter: "all",
  exceptionReport: null,
  exceptionMode: false,
  mobileOrigins: [],
  mobileFile: null,

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
      // P1 — backend now emits one event per (peripheral, invoked method).
      // Dedup must include the method, otherwise the second arrival for the
      // same class would be silently dropped and we'd lose the per-method
      // breakdown the graph relies on. The peripheral node still keys off
      // the class id (one card per class), but the connection list keeps
      // every (id, method) tuple.
      if (
        state.focusConnections.some(
          (c) =>
            c.id === conn.id &&
            (c.viaMethodInTarget ?? null) === (conn.viaMethodInTarget ?? null),
        )
      ) {
        return state;
      }
      // Stamp wall-clock arrival time so FocusEdge can drive its draw
      // animation off elapsed-since-arrival rather than mount time. This
      // is what makes the edge animation idempotent under ReactFlow's
      // spurious edge-layer remounts.
      const stamped = { ...conn, firstSeenAt: Date.now() };
      const nextNodes = new Map(state.nodes);
      // Always overwrite — peripheral data is the latest version of that node.
      nextNodes.set(stamped.id, focusConnToClassNode(stamped));
      return {
        focusConnections: [...state.focusConnections, stamped],
        nodes: nextNodes,
        version: state.version + 1,
      };
    }),

  setProjectPath: (path) => set({ projectPath: path }),

  setFocusMethodMode: (enabled) => set({ focusMethodMode: enabled }),

  setFocusMethod: (focus) => {
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

  openClassSheetAtMethod: (classNodeId, methodName) =>
    set({
      selectedNodeId: classNodeId,
      sheetMode: "class",
      selectedVariable: null,
      selectedMethod: null,
      methodSheetHighlight: { className: null, methodName },
    }),

  setPendingReanalysis: (pending) => set({ pendingReanalysis: pending }),

  triggerLayoutReset: () =>
    set((state) => ({ layoutResetTick: state.layoutResetTick + 1 })),

  markUserInteracted: () => set({ userInteracted: true }),
  resetUserInteraction: () => set({ userInteracted: false }),

  setIsPro: (pro) => set({ isPro: pro }),
  setPendingAnalysis: (p) => set({ pendingAnalysis: p }),
  setDetectedJavaVersion: (version) => set({ detectedJavaVersion: version }),
  setShowTests: (show) => set({ showTests: show }),
  setImpactReport: (report) => set({ impactReport: report }),
  setImpactLoading: (loading) => set({ impactLoading: loading }),
  setOpenHelpPopover: (id) => set({ openHelpPopover: id }),
  addDiagnostic: (d) =>
    set((state) => ({ diagnostics: [...state.diagnostics, d] })),

  setEdgeGrouping: (mode) => set({ edgeGrouping: mode }),

  setExceptionReport: (report) => set({ exceptionReport: report }),
  setExceptionMode: (enabled) => set({ exceptionMode: enabled }),
  setMobileOrigins: (origins) => set({ mobileOrigins: origins }),
  openMobileFile: (path, name) => set({ mobileFile: { path, name } }),
  closeMobileFile: () => set({ mobileFile: null }),

  setFocusDirectionFilter: (mode) => set({ focusDirectionFilter: mode }),

  addFocusConnectionsWithDepth: (connections, depth, parentFqn) =>
    set((state) => {
      if (connections.length === 0) return state;
      const now = Date.now();
      const existing = new Set(
        state.focusConnections.map(
          (c) => `${c.id}|${c.viaMethodInTarget ?? ""}|${c.depth ?? 1}`,
        ),
      );
      const additions: FocusConnectionPayload[] = [];
      for (const c of connections) {
        const key = `${c.id}|${c.viaMethodInTarget ?? ""}|${depth}`;
        if (existing.has(key)) continue;
        existing.add(key);
        additions.push({
          ...c,
          depth,
          parentFqn,
          firstSeenAt: c.firstSeenAt ?? now,
        });
      }
      if (additions.length === 0) return state;
      const nextNodes = new Map(state.nodes);
      for (const stamped of additions) {
        nextNodes.set(stamped.id, focusConnToClassNode(stamped));
      }
      return {
        focusConnections: [...state.focusConnections, ...additions],
        nodes: nextNodes,
        version: state.version + 1,
      };
    }),

  removeFocusConnectionsByParent: (parentFqn) =>
    set((state) => {
      const kept = state.focusConnections.filter(
        (c) => c.parentFqn !== parentFqn,
      );
      if (kept.length === state.focusConnections.length) return state;
      // Drop nodes that no longer have a connection — the focus class and
      // depth-1 peripherals stay because they're keyed by their own ids and
      // never have parentFqn set. depth-2 peripherals get evicted from the
      // nodes Map too so ReactFlow stops trying to render them.
      const keepIds = new Set<string>([state.focusClass?.id ?? ""]);
      for (const c of kept) keepIds.add(c.id);
      const nextNodes = new Map(state.nodes);
      for (const id of Array.from(nextNodes.keys())) {
        if (!keepIds.has(id)) nextNodes.delete(id);
      }
      return {
        focusConnections: kept,
        nodes: nextNodes,
        version: state.version + 1,
      };
    }),

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
      // P2 — directional filter is also per-session: a new FOCO should start
      // with the radial view ungated so the dev sees the full picture first.
      focusDirectionFilter: "all",
      // Ariadna — exception report is per-session.
      exceptionReport: null,
      exceptionMode: false,
      mobileOrigins: [],
      mobileFile: null,
    }),
}));

// Dev / test convenience — exposes the zustand store on the global window so
// Playwright (and a DevTools console) can introspect or drive it without
// importing the module. Guarded by a guard against SSR; no-op in node.
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__cmStore = useGraphStore;
}
