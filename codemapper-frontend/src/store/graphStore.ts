"use client";

import { create } from "zustand";
import type {
  ClassFoundPayload,
  ClassNodeData,
  Connection,
  ConnectionFoundPayload,
  FieldsParsedPayload,
  MethodsParsedPayload,
  ParsedField,
  ParsedMethod,
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

  selectNode: (id) => set({ selectedNodeId: id }),
  clearSelection: () => set({ selectedNodeId: null }),

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

  markUserInteracted: () => set({ userInteracted: true }),
  resetUserInteraction: () => set({ userInteracted: false }),

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
      version: 0,
    }),
}));
