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

export type SSEEventType =
  | "session_start"
  | "package_found"
  | "class_found"
  | "fields_parsed"
  | "methods_parsed"
  | "connection_found"
  | "session_complete"
  | "error";

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
