export type ClassKind =
  | "CLASS"
  | "INTERFACE"
  | "ENUM"
  | "RECORD"
  | "ABSTRACT_CLASS";

export type ConnectionType =
  | "EXTENDS"
  | "IMPLEMENTS"
  | "COMPOSITION"
  | "DEPENDENCY_INJECTION"
  | "METHOD_CALL"
  | "ANNOTATION_USAGE";

export interface ParsedField {
  name: string;
  type: string;
  modifiers: string[];
  annotations: string[];
}

export interface ParsedMethod {
  name: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  modifiers: string[];
  annotations: string[];
  isStatic: boolean;
  isAbstract: boolean;
  lineCount: number;
}

export interface ClassNodeData {
  id: string;
  name: string;
  fullyQualifiedName: string;
  packageName: string;
  type: ClassKind;
  annotations: string[];
  filePath: string;
  lineCount: number;
  modifiers: string[];
  fields: ParsedField[];
  methods: ParsedMethod[];
}

export interface Connection {
  from: string;
  to: string;
  type: ConnectionType;
  label: string;
}

export interface AnalyzeResponse {
  sessionId: string;
  message?: string;
}

export interface ClassSourceResponse {
  className?: string;
  packageName?: string;
  fullyQualifiedName?: string;
  sourceCode: string;
  filePath?: string;
  lineCount?: number;
}

/**
 * Single source of truth for SSE event names. The runtime list MUST stay in
 * sync with the backend's `BaseEvent.eventName()` values — every name here
 * gets an `addEventListener(name, …)` registration in `lib/sse.ts`. Adding a
 * value here automatically grows `SSEEventType` so the switch in `useSSE`
 * exhaustiveness-checks at compile time.
 */
export const SSE_EVENT_NAMES = [
  "session_start",
  "package_found",
  "class_found",
  "fields_parsed",
  "methods_parsed",
  "connection_found",
  "session_complete",
  "limit_reached",
  "focus_class_loaded",
  "error",
] as const;

export type SSEEventType = (typeof SSE_EVENT_NAMES)[number];

export type FocusConnectionType =
  | "EXTENDS"
  | "IMPLEMENTS"
  | "CALLED_BY"
  | "CALLS"
  | "USES_PROPERTIES";

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
}

export interface SessionStartPayload {
  sessionId: string;
  projectName?: string;
  startedAt?: number;
}

export interface PackageFoundPayload {
  packageName: string;
}

export interface ClassFoundPayload {
  id: string;
  name: string;
  fullyQualifiedName: string;
  packageName: string;
  type: ClassKind;
  annotations: string[];
  filePath: string;
  lineCount: number;
  modifiers: string[];
}

export interface FieldsParsedPayload {
  classId: string;
  fields: ParsedField[];
}

export interface MethodsParsedPayload {
  classId: string;
  methods: ParsedMethod[];
}

export interface ConnectionFoundPayload {
  from: string;
  to: string;
  type: ConnectionType;
  label: string;
}

export interface SessionCompletePayload {
  totalClasses: number;
  totalConnections: number;
  durationMs?: number;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface LimitReachedPayload {
  limit: number;
  totalFilesAvailable: number;
  filesParsed: number;
  message: string;
}

export interface FocusClassLoadedPayload {
  id: string;
  fullyQualifiedName: string;
  name: string;
  packageName: string;
  type: ClassKind;
  annotations: string[];
  modifiers: string[];
  fields: ParsedField[];
  methods: ParsedMethod[];
  implementsList: string[];
  extendsClass: string | null;
  sourceFile: string;
  lineCount: number;
}

export interface FocusConnectionPayload {
  id: string;
  fullyQualifiedName: string;
  name: string;
  packageName: string;
  type: ClassKind;
  annotations: string[];
  connectionType: FocusConnectionType;
  fields: ParsedField[];
  methods: ParsedMethod[];
  /** 1-based emission order from backend. */
  position: number;
  sourceFile: string;
}
