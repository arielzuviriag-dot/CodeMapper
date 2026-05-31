import axios, { AxiosError } from "axios";
import { toast } from "sonner";
import type {
  AnalyzeResponse,
  ClassSourceResponse,
  FocusClassLoadedPayload,
  FocusConnectionPayload,
  FocusMethodLoadedPayload,
  ImpactReport,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string }>) => {
    const message =
      error.response?.data?.message ??
      error.message ??
      "Error desconocido en el servidor";
    toast.error(message);
    return Promise.reject(error);
  },
);

export type DemoMode = "pro" | undefined;

/** Mirror of backend `codemapper.limits.free-max-files`. Used for client-side UX hints. */
export const FREE_TIER_FILE_LIMIT = 100;

const DEMO_MODE_STORAGE_KEY = "cm-demo-mode";

export function readDemoModeFromUrl(): DemoMode {
  if (typeof window === "undefined") return undefined;
  const value = new URL(window.location.href).searchParams
    .get("demo")
    ?.toLowerCase();
  return value === "pro" ? "pro" : undefined;
}

export function persistDemoMode(mode: DemoMode): void {
  if (typeof window === "undefined") return;
  if (mode) {
    window.sessionStorage.setItem(DEMO_MODE_STORAGE_KEY, mode);
  } else {
    window.sessionStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  }
}

export function getStoredDemoMode(): DemoMode {
  if (typeof window === "undefined") return undefined;
  const stored = window.sessionStorage.getItem(DEMO_MODE_STORAGE_KEY);
  return stored === "pro" ? "pro" : undefined;
}

/** Lee de URL primero, hace fallback a sessionStorage. Persiste el valor leído. */
export function resolveDemoMode(): DemoMode {
  const fromUrl = readDemoModeFromUrl();
  if (fromUrl) {
    persistDemoMode(fromUrl);
    return fromUrl;
  }
  return getStoredDemoMode();
}

export async function uploadProject(
  file: File,
  demoMode?: DemoMode,
): Promise<AnalyzeResponse> {
  const fd = new FormData();
  fd.append("file", file);
  if (demoMode) fd.append("demoMode", demoMode);
  const { data } = await api.post<AnalyzeResponse>(
    "/api/analyze/upload",
    fd,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export interface LocalPathOptions {
  /** Optional front-end project path — links its screens → controllers. */
  frontendPath?: string;
  /** "web" | "react-native". */
  frontendKind?: string;
}

export async function analyzeLocalPath(
  absolutePath: string,
  demoMode?: DemoMode,
  options?: LocalPathOptions,
): Promise<AnalyzeResponse> {
  const { data } = await api.post<AnalyzeResponse>("/api/analyze/path", {
    absolutePath,
    demoMode,
    frontendPath: options?.frontendPath,
    frontendKind: options?.frontendKind,
  });
  return data;
}

export async function analyzeGithub(
  repoUrl: string,
  demoMode?: DemoMode,
): Promise<AnalyzeResponse> {
  const { data } = await api.post<AnalyzeResponse>("/api/analyze/github", {
    repoUrl,
    demoMode,
  });
  return data;
}

export interface AnalyzeFocusInput {
  projectPath: string;
  focusFile: string;
  demoMode?: DemoMode;
}

export interface AnalyzeFocusResponse extends AnalyzeResponse {
  projectName?: string;
  totalFiles?: number;
}

export async function analyzeFocus(
  input: AnalyzeFocusInput,
): Promise<AnalyzeFocusResponse> {
  const { data } = await api.post<AnalyzeFocusResponse>("/api/analyze/focus", {
    projectPath: input.projectPath,
    focusFile: input.focusFile,
    demoMode: input.demoMode,
  });
  return data;
}

export interface AnalyzeFocusMethodInput {
  projectPath: string;
  focusFile: string;
  methodName: string;
  demoMode?: DemoMode;
}

export async function analyzeFocusMethod(
  input: AnalyzeFocusMethodInput,
): Promise<AnalyzeFocusResponse> {
  const { data } = await api.post<AnalyzeFocusResponse>(
    "/api/analyze/focus-method",
    {
      projectPath: input.projectPath,
      focusFile: input.focusFile,
      methodName: input.methodName,
      demoMode: input.demoMode,
    },
  );
  return data;
}

export interface AnalyzeExceptionInput {
  projectPath: string;
  stackTrace: string;
  /** Optional RN project path to link mobile screens → endpoints. */
  mobilePath?: string;
  demoMode?: DemoMode;
}

/**
 * Ariadna — start an exception-investigation session. Same pending-promise
 * pattern as {@link analyzeFocus}: the POST creates the session, the SSE
 * stream parses the trace + builds the map. Returns the sessionId.
 */
export async function analyzeException(
  input: AnalyzeExceptionInput,
): Promise<AnalyzeFocusResponse> {
  const { data } = await api.post<AnalyzeFocusResponse>("/api/analyze/exception", {
    projectPath: input.projectPath,
    stackTrace: input.stackTrace,
    mobilePath: input.mobilePath,
    demoMode: input.demoMode,
  });
  return data;
}

export interface FocoExportRequest {
  focusClass: FocusClassLoadedPayload;
  connections: FocusConnectionPayload[];
  pro: boolean;
  limitApplied: boolean;
  totalAvailable: number;
}

/**
 * Render the current FOCO state as a printable PDF. Stateless on the
 * server — sends the same data the user is looking at, so the PDF mirrors
 * the UI (FREE limit included). Returns the raw blob for download.
 */
export async function exportFocoPdf(
  request: FocoExportRequest,
): Promise<Blob> {
  const { data } = await api.post<Blob>("/api/foco/export/pdf", request, {
    responseType: "blob",
    headers: { "Content-Type": "application/json" },
    timeout: 60_000,
  });
  return data;
}

export interface FocoMethodExportRequest {
  focusMethod: FocusMethodLoadedPayload;
  connections: FocusConnectionPayload[];
  pro: boolean;
  limitApplied: boolean;
  totalAvailable: number;
}

/** Mirror of {@link exportFocoPdf} but for method-focus mode. The PDF body
 *  splits the connections into "QUIÉN LO INVOCA" (callers) and "A QUIÉN
 *  INVOCA" (callees). Same FREE/PRO suffix on the filename. */
export async function exportFocoMethodPdf(
  request: FocoMethodExportRequest,
): Promise<Blob> {
  const { data } = await api.post<Blob>("/api/foco/export/method-pdf", request, {
    responseType: "blob",
    headers: { "Content-Type": "application/json" },
    timeout: 60_000,
  });
  return data;
}

/** One row of the Escuchando PDF detail table — mirrors a ClassNode. */
export interface TraceExportNode {
  className: string;
  fqcn: string | null;
  http: boolean;
  hitCount: number;
  order: number;
  depth: number;
  methods: string[];
  status: string;
}

export interface TraceExportRequest {
  view: string;
  urlFilter: string;
  rootClassName: string | null;
  /** PNG data-URL snapshot of the on-screen graph (optional). */
  imageBase64: string | null;
  nodes: TraceExportNode[];
}

/**
 * Render the live "Escuchando" graph as a PDF. Stateless on the server — sends
 * the on-screen nodes + a snapshot, so the PDF mirrors the screen. Returns the
 * raw blob for download.
 */
export async function exportTracePdf(
  request: TraceExportRequest,
): Promise<Blob> {
  const { data } = await api.post<Blob>("/api/trace/export/pdf", request, {
    responseType: "blob",
    headers: { "Content-Type": "application/json" },
    timeout: 60_000,
  });
  return data;
}

export async function getClassSource(
  sessionId: string,
  classId: string,
): Promise<ClassSourceResponse> {
  const { data } = await api.get<ClassSourceResponse>(
    `/api/analyze/source/${encodeURIComponent(sessionId)}/${encodeURIComponent(classId)}`,
  );
  return data;
}

export interface ProjectFileResponse {
  fileName: string;
  filePath: string;
  sourceCode: string;
  lineCount: number;
}

/** Read any file inside the session's project/mobile roots (e.g. a RN screen)
 *  for the mobile code viewer. */
export async function getProjectFile(
  sessionId: string,
  path: string,
): Promise<ProjectFileResponse> {
  const { data } = await api.get<ProjectFileResponse>(
    `/api/analyze/file/${encodeURIComponent(sessionId)}`,
    { params: { path } },
  );
  return data;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/api/analyze/session/${encodeURIComponent(sessionId)}`);
}

/** P4 — shape of the {@code /focus/{sessionId}/expand} response. The backend
 *  returns the peripheral FQN it expanded (for confirmation) and the list
 *  of new connections (i.e. NOT already in the parent session). */
export interface ExpandPeripheralResponse {
  peripheralFqn: string;
  connections: FocusConnectionPayload[];
}

/**
 * P4 — expand one peripheral to depth-2. PRO-only on the backend; a FREE
 * session results in HTTP 403 (the axios interceptor surfaces the
 * paywall message via toast).
 */
export async function expandPeripheral(
  sessionId: string,
  peripheralFqn: string,
): Promise<ExpandPeripheralResponse> {
  const { data } = await api.post<ExpandPeripheralResponse>(
    `/api/analyze/focus/${encodeURIComponent(sessionId)}/expand`,
    { peripheralFqn },
    { timeout: 90_000 },
  );
  return data;
}

export function streamUrl(sessionId: string): string {
  return `${API_BASE_URL}/api/analyze/stream/${encodeURIComponent(sessionId)}`;
}

/**
 * F4 — fetch the transitive impact report for the focus class. Re-walks the
 * project on the backend, so the call can take seconds on large repos. The
 * report shape differs by plan: FREE returns counts + cycle flag; PRO adds
 * the full FQN lists that drive the simulate-change overlay.
 */
export async function getImpactReport(
  sessionId: string,
  depth: number = 4,
): Promise<ImpactReport> {
  const { data } = await api.get<ImpactReport>(
    `/api/analyze/focus/${encodeURIComponent(sessionId)}/impact`,
    { params: { depth }, timeout: 60_000 },
  );
  return data;
}

export interface DiagnosticsExportRequest {
  focusName: string;
  focusFqn?: string | null;
  projectName?: string | null;
  javaVersion?: string | null;
  pro: boolean;
  diagnostics: Array<{
    kind: "UNRESOLVED" | "FALSE_NEGATIVE" | "UNPARSEABLE";
    file: string;
    line: number;
    snippet: string;
    reason: string;
  }>;
}

/**
 * F-deep — render the contents of the DiagnosticsPanel as a printable PDF.
 * Same stateless pattern as exportFocoPdf: the frontend ships the data it
 * already has in the store and the backend just formats.
 */
export async function exportDiagnosticsPdf(
  request: DiagnosticsExportRequest,
): Promise<Blob> {
  const { data } = await api.post<Blob>(
    "/api/foco/export/diagnostics-pdf",
    request,
    {
      responseType: "blob",
      headers: { "Content-Type": "application/json" },
      timeout: 60_000,
    },
  );
  return data;
}
