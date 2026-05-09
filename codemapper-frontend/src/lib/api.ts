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

export async function analyzeLocalPath(
  absolutePath: string,
  demoMode?: DemoMode,
): Promise<AnalyzeResponse> {
  const { data } = await api.post<AnalyzeResponse>("/api/analyze/path", {
    absolutePath,
    demoMode,
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

export async function getClassSource(
  sessionId: string,
  classId: string,
): Promise<ClassSourceResponse> {
  const { data } = await api.get<ClassSourceResponse>(
    `/api/analyze/source/${encodeURIComponent(sessionId)}/${encodeURIComponent(classId)}`,
  );
  return data;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/api/analyze/session/${encodeURIComponent(sessionId)}`);
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
