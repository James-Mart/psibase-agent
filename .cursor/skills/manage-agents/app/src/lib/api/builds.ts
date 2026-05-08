import { request } from "./client";

export type BuildStatus =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type LogStream = "stdout" | "stderr";

export interface BuildInfo {
  status: BuildStatus;
  buildId: number | null;
  pid: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  stdoutSize: number;
  stderrSize: number;
}

export interface BuildSummary {
  workerName: string;
  status: BuildStatus;
  buildId: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
}

export interface LogChunk {
  content: string;
  nextOffset: number;
  totalSize: number;
  eof: boolean;
}

export function startBuild(name: string): Promise<{ buildId: number; pid: number }> {
  return request(`/api/workers/${encodeURIComponent(name)}/build`, {
    method: "POST",
  });
}

export function cancelBuild(name: string): Promise<{ ok: true }> {
  return request(`/api/workers/${encodeURIComponent(name)}/build/cancel`, {
    method: "POST",
  });
}

export function fetchBuildStatus(name: string): Promise<BuildInfo> {
  return request(`/api/workers/${encodeURIComponent(name)}/build`);
}

export function fetchBuildLog(
  name: string,
  stream: LogStream,
  offset: number,
  limit = 65_536,
): Promise<LogChunk> {
  const params = new URLSearchParams({
    stream,
    offset: String(offset),
    limit: String(limit),
  });
  return request(
    `/api/workers/${encodeURIComponent(name)}/build/log?${params.toString()}`,
  );
}

export function fetchAllBuilds(): Promise<BuildSummary[]> {
  return request("/api/builds");
}
