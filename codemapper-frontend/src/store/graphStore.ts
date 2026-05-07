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
  MethodsParsedPayload,
  ParsedField,
  ParsedMethod,
  SheetMode,
} from "@/lib/types";

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
  /** Method-as-focus payload (FOCUS_METHOD mode). */
  focusMethod: FocusMethodLoadedPayload | null;
  focusMethodMode: boolean;
  /** True while a FOCO SCANER navigation is in flight (sheet → new session).
   *  The map page uses this flag to swap the full-screen loader for a smaller
   *  in-graph loader so the header + sidebar stay visible during the
   *  transition. Survives `reset()` so it can carry across the session change. */
  pendingReanalysis: boolean;
  /** Incrementa en cada flush. Usalo como dep estable en lugar del Map/array. */
  version: number;

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
  /** Open the sheet on a specific method of a class node. */
  openMethodSheet: (classNodeId: string, method: ParsedMethod) => void;
  setPendingReanalysis: (pending: boolean) => void;
  markUserInteracted: () => void;
  resetUserInteraction: () => void;
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
  focusMethod: null,
  focusMethodMode: false,
  pendingReanalysis: false,
  version: 0,

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
    }),
  clearSelection: () =>
    set({
      selectedNodeId: null,
      sheetMode: "class",
      selectedVariable: null,
      selectedMethod: null,
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

  openMethodSheet: (classNodeId, method) =>
    set({
      selectedNodeId: classNodeId,
      sheetMode: "method",
      selectedVariable: null,
      selectedMethod: method,
    }),

  setPendingReanalysis: (pending) => set({ pendingReanalysis: pending }),

  markUserInteracted: () => set({ userInteracted: true }),
  resetUserInteraction: () => set({ userInteracted: false }),

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
      focusMethod: null,
      focusMethodMode: false,
      version: 0,
    }),
}));
