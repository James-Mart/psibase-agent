import { request } from "./client";

export type ChainStatus =
  | "idle"
  | "launching"
  | "booting"
  | "ready"
  | "boot-failed"
  | "failed"
  | "stopped";

export type ChainPhase = "launch" | "boot";
export type LogStream = "stdout" | "stderr";

export interface ChainInfo {
  status: ChainStatus;
  chainId: number | null;
  port: number | null;
  launchPid: number | null;
  bootPid: number | null;
  launchStartedAt: string | null;
  launchFinishedAt: string | null;
  launchExitCode: number | null;
  bootStartedAt: string | null;
  bootFinishedAt: string | null;
  bootExitCode: number | null;
  launchStdoutSize: number;
  launchStderrSize: number;
  bootStdoutSize: number;
  bootStderrSize: number;
  psinodeAvailable: boolean;
}

export interface ChainSummary {
  workerName: string;
  status: ChainStatus;
  chainId: number | null;
  port: number | null;
  launchStartedAt: string | null;
  launchFinishedAt: string | null;
  bootFinishedAt: string | null;
}

export interface LogChunk {
  content: string;
  nextOffset: number;
  totalSize: number;
  eof: boolean;
}

export function startChain(name: string): Promise<{ chainId: number; pid: number; port: number }> {
  return request(`/api/workers/${encodeURIComponent(name)}/chain`, {
    method: "POST",
  });
}

export function cancelChain(name: string): Promise<{ ok: true }> {
  return request(`/api/workers/${encodeURIComponent(name)}/chain/cancel`, {
    method: "POST",
  });
}

export function fetchChainStatus(name: string): Promise<ChainInfo> {
  return request(`/api/workers/${encodeURIComponent(name)}/chain`);
}

export function fetchChainLog(
  name: string,
  phase: ChainPhase,
  stream: LogStream,
  offset: number,
  limit = 65_536,
): Promise<LogChunk> {
  const params = new URLSearchParams({
    phase,
    stream,
    offset: String(offset),
    limit: String(limit),
  });
  return request(
    `/api/workers/${encodeURIComponent(name)}/chain/log?${params.toString()}`,
  );
}

export function fetchAllChains(): Promise<ChainSummary[]> {
  return request("/api/chains");
}
