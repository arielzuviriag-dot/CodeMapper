import axios, { AxiosError } from "axios";
import { toast } from "sonner";
import type { AnalyzeResponse, ClassSourceResponse } from "./types";

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
