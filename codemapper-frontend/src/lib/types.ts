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
  /** 1-based start line of the method declaration in its source file (0 if unknown). */
  startLine?: number;
  /** 1-based inclusive end line of the method body (0 if unknown). */
  endLine?: number;
  /** Simple class names from the `throws` clause. Empty when the method
   *  declares none. F1 contract surface — drives the exception cluster. */
  thrownExceptions?: string[];
  /** Subset of `annotations` that match Spring/JSR security gates. F1 contract
   *  surface — drives the shield badge next to the method pin. */
  securityAnnotations?: string[];
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
  "focus_method_loaded",
  "unresolved_reference",
  "exception_report",
  "mobile_origins",
  "error",
] as const;

export type SSEEventType = (typeof SSE_EVENT_NAMES)[number];

export type FocusConnectionType =
  | "EXTENDS"
  | "IMPLEMENTS"
  | "CALLED_BY"
  | "CALLS"
  | "USES_PROPERTIES"
  | "INVOKES_METHOD"
  | "INVOKES_OUTGOING";

/** Optional enclosing control-flow context for a call site. Populated by the
 *  outgoing side of method focus when the call sits inside an if/loop/try/
 *  switch — drives the chip rendered on the peripheral node. */
export type ControlContext =
  | "IF_THEN"
  | "IF_ELSE"
  | "LOOP"
  | "TRY"
  | "CATCH"
  | "SWITCH_CASE";

/** Drives which view the right-hand sheet renders. */
export type SheetMode = "class" | "variable" | "method";

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
}

export interface SessionStartPayload {
  sessionId: string;
  projectName?: string;
  startedAt?: number;
  /** Major Java version detected from pom.xml/build.gradle ("8","11","17","21").
   *  Null when no manifest could be parsed — UI shows "Java ?" instead of a
   *  concrete version, and the help popover lists everything CodeMapper supports. */
  detectedJavaVersion?: string | null;
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
  /** Total real detectado en el proyecto (P1 + P2 sumados) — el número
   *  honesto que el panel de métricas debe mostrar como "10 / N", incluso
   *  si solo N=10 efectivamente se emitieron por SSE. */
  totalConnectionsDetected: number;
  /** True cuando P2 cortó por el hard cap de exploración (FREE: 200).
   *  Cuando es true el frontend renderiza "200+" en lugar del número
   *  absoluto, porque el walk se cortó antes de saber el total real. */
  truncated: boolean;
}

/** A detected behavioral annotation (Spring/JSR) on the focus class or one
 *  of its methods. F2 contract — feeds the BehaviorChipBar. */
export interface BehaviorChip {
  /** Annotation simple name with leading "@" (e.g. "@Transactional"). */
  annotation: string;
  /** Single-string argument when present (e.g. "auth" for `@Cacheable("auth")`),
   *  or a key=value pair for the first non-string arg (e.g. "fixedRate=5000").
   *  Null for marker annotations. */
  value: string | null;
  /** Method this annotation lives on, or null when it's at class level. */
  methodName: string | null;
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
  /** Behavioral chips (@Transactional, @Cacheable, @Async, etc.) detected on
   *  the focus class. Empty array when none — frontend hides the bar. */
  behaviorAnnotations?: BehaviorChip[];
  /** Class-level Jacoco LINE coverage 0–100. Null when no jacoco.xml found
   *  in the project — donut hidden, sheet tab grays out. */
  coveragePercent?: number | null;
  /** Per-method Jacoco coverage keyed by simple method name. Empty when no
   *  report. Drives the per-method drill-down in the sheet's Cobertura tab. */
  methodCoverage?: Record<string, number>;
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
  /** Method on the SOURCE side that produces this relationship. For
   *  CALLED_BY / INVOKES_METHOD, the caller class's method that contains the
   *  call expression. For CALLS / INVOKES_OUTGOING, the focus method that
   *  originates the call. Null when the relationship is signature-only. */
  viaMethodInSource?: string | null;
  /** Method on the TARGET side. For INVOKES_OUTGOING, the simple name of the
   *  method invoked on the target class. Null otherwise (or redundant). */
  viaMethodInTarget?: string | null;
  /** Enclosing control-flow context for INVOKES_OUTGOING call sites. Null
   *  when the call lives in the linear top-level body. */
  controlContext?: ControlContext | null;
  /** True when this peripheral lives under a `/test/java/` source root —
   *  drives the dashed grey edge style and the "Mostrar tests" toggle. */
  isTest?: boolean;
  /** True when this peripheral is a test that mocks the focus (declares a
   *  field annotated @Mock/@MockBean/@SpyBean/@InjectMocks whose type
   *  matches the focus). Drives the mask icon on the edge. */
  isMock?: boolean;
  /** Wall-clock timestamp (ms) of when this connection first arrived in the
   *  store. Set by addFocusConnection on insert. Drives the edge's draw
   *  animation independently of the React component lifecycle: even if the
   *  edge component is remounted by ReactFlow's edge-layer rebuild, the new
   *  instance reads firstSeenAt and computes "I should be at progress N"
   *  rather than restarting from zero. Without this, the animation visibly
   *  flickers each time the radial layout rebalances. */
  firstSeenAt?: number;
  /** P3 — semantic category of how the caller uses the focus class:
   *  INVOCATION (body invokes focus methods), INSTANTIATION (body calls
   *  {@code new Focus(...)}), INJECTION (DI field / constructor param of
   *  the focus type without body usage), DECLARATION (focus appears only
   *  as a method param or return type). Drives the icon and tooltip on
   *  the edge label. Null when the connection isn't a body relationship
   *  (e.g. EXTENDS, IMPLEMENTS, USES_PROPERTIES). */
  referenceKind?: "INVOCATION" | "INSTANTIATION" | "INJECTION" | "DECLARATION" | null;
  /** P4 — radial-graph depth this connection lives on. {@code 1} = original
   *  level-1 peripheral (default); {@code 2} = peripheral of a peripheral,
   *  added on-demand by the PRO-only "Expandir" button. Stamped by the
   *  client; the backend doesn't know about it. */
  depth?: 1 | 2;
  /** P4 — FQN of the depth-1 parent peripheral when {@code depth === 2}.
   *  Drives layout (sub-arc around the parent) and collapse semantics. */
  parentFqn?: string | null;
}

export type FocusReferenceKind = NonNullable<FocusConnectionPayload["referenceKind"]>;

/** F-deep — diagnostic finding from deep body analysis. Three kinds:
 *  - UNRESOLVED: parser couldn't resolve an expression that may reference the focus
 *  - FALSE_NEGATIVE: focus simple-name appears in body but no symbol confirmed
 *  - UNPARSEABLE: file couldn't be parsed at all (broken syntax, etc.) */
export type UnresolvedReferenceKind =
  | "UNRESOLVED"
  | "FALSE_NEGATIVE"
  | "UNPARSEABLE";

export interface UnresolvedReferencePayload {
  reference: {
    kind: UnresolvedReferenceKind;
    file: string;
    line: number;
    snippet: string;
    reason: string;
  };
}

/** F4 — "Simular cambio" report. Counts always populated; the FQN lists are
 *  only populated for PRO sessions, FREE leaves them empty (frontend then
 *  shows just the counter + CTA without the overlay highlight). */
export interface ImpactReport {
  totalImpact: number;
  totalTests: number;
  hasCycles: boolean;
  directCallers: string[];
  transitiveCallers: string[];
  affectedTests: string[];
  cycles: string[][];
}

/** Ariadna — a React Native screen that reaches a backend endpoint present in
 *  the exception chain. Drives the first node(s) of the flow graph. */
export interface MobileOriginPayload {
  screenName: string;
  screenFile: string;
  apiFunction: string;
  apiFile: string;
  method: string;
  path: string;
  /** Graph node id of the controller class this screen reaches. */
  attachClassId: string;
  attachFqn: string;
}

/** Ariadna — one frame (`at ...` line) of a parsed stack trace. */
export interface ExceptionFramePayload {
  /** Declaring class as it appears in the trace (may include `Outer$Inner`). */
  declaringClass: string;
  /** `declaringClass` with any `$Inner` suffix stripped — used to match the
   *  project's parsed classes. */
  topLevelFqn: string;
  simpleName: string;
  methodName: string;
  /** Source file (e.g. `AuthService.java`) or null for native/unknown frames. */
  fileName: string | null;
  /** 1-based line number, 0 when the trace didn't carry one. */
  lineNumber: number;
  /** True when this class exists in the analysed project — drives the
   *  clickable link + full opacity (library frames stay dimmed). */
  userCode: boolean;
  /** Graph node id (FQN with dots→dashes) for user-code frames; null otherwise. */
  classId: string | null;
}

/** Ariadna — one exception in the causal chain. */
export interface ExceptionCausePayload {
  exceptionType: string;
  message: string;
  frames: ExceptionFramePayload[];
}

/** Ariadna — the structured "Informe del error" the backend ships once, after
 *  the focus class + peripheral connection events. */
export interface ExceptionReportPayload {
  causes: ExceptionCausePayload[];
  topExceptionType: string;
  topExceptionMessage: string;
  rootCauseType: string;
  rootCauseMessage: string;
  /** Top-level FQN of the focus class (root-cause throw site). Null when no
   *  project class appeared in the trace. */
  focusFqn: string | null;
  focusClassId: string | null;
  focusMethod: string | null;
  focusLine: number;
}

export interface FocusMethodLoadedPayload {
  id: string;
  containingClass: string;
  containingClassFullyQualifiedName: string;
  containingClassPackage: string;
  methodName: string;
  /** Single-line signature (`public Foo bar(int x)`). */
  signature: string;
  returnType: string;
  parameters: { name: string; type: string }[];
  /** Source slice from `startLine` through `endLine` of the focus file. */
  sourceCode: string;
  lineCount: number;
  startLine: number;
  endLine: number;
  /** Absolute path of the .java file holding the method — enables the
   *  "Foco a la clase" action from method-focus mode. */
  sourceFile?: string;
}
