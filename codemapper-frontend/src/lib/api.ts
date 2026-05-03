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

export async function uploadProject(file: File): Promise<AnalyzeResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<AnalyzeResponse>(
    "/api/analyze/upload",
    fd,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function analyzeLocalPath(
  absolutePath: string,
): Promise<AnalyzeResponse> {
  const { data } = await api.post<AnalyzeResponse>("/api/analyze/path", {
    absolutePath,
  });
  return data;
}

export async function analyzeGithub(repoUrl: string): Promise<AnalyzeResponse> {
  const { data } = await api.post<AnalyzeResponse>("/api/analyze/github", {
    repoUrl,
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
