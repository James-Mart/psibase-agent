import { request } from "./client";
import { ApiError, CreateWorkerError } from "./errors";
import {
  DEFAULT_SOURCE_BRANCH,
  type CreateWorkerResult,
  type DeleteWorkerResult,
  type WorkerDetails,
  type WorkerInfo,
  type WorkerStatus,
} from "./types";

export function listWorkers(): Promise<WorkerInfo[]> {
  return request<WorkerInfo[]>("/api/workers");
}

export async function createWorker(
  branch: string,
  sourceBranch?: string,
): Promise<CreateWorkerResult> {
  const resolved = sourceBranch?.trim() || DEFAULT_SOURCE_BRANCH;
  try {
    return await request<CreateWorkerResult>("/api/workers", {
      method: "POST",
      body: { branch, sourceBranch: resolved },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as
        | { stderr?: unknown; output?: unknown }
        | undefined;
      throw new CreateWorkerError(err.message, err.status, {
        stderr: typeof body?.stderr === "string" ? body.stderr : undefined,
        output: typeof body?.output === "string" ? body.output : undefined,
        body,
      });
    }
    throw err;
  }
}

export function startAgent(name: string): Promise<{ pid: number }> {
  return request<{ pid: number }>(`/api/workers/${encodeURIComponent(name)}/start`, {
    method: "POST",
  });
}

export function stopAgent(name: string): Promise<{ ok: boolean; pid: number }> {
  return request<{ ok: boolean; pid: number }>(
    `/api/workers/${encodeURIComponent(name)}/stop`,
    { method: "POST" },
  );
}

export function fetchWorkerDetails(name: string): Promise<WorkerDetails> {
  return request<WorkerDetails>(
    `/api/workers/${encodeURIComponent(name)}/details`,
  );
}

export function saveWorkerNote(name: string, note: string): Promise<void> {
  return request<void>(`/api/workers/${encodeURIComponent(name)}/note`, {
    method: "PUT",
    body: { note },
  });
}

export function saveWorkerStatus(
  name: string,
  status: WorkerStatus,
): Promise<void> {
  return request<void>(`/api/workers/${encodeURIComponent(name)}/status`, {
    method: "PUT",
    body: { status },
  });
}

export function renameWorker(
  name: string,
  newName: string,
): Promise<{ ok: true; newName: string }> {
  return request<{ ok: true; newName: string }>(
    `/api/workers/${encodeURIComponent(name)}/rename`,
    { method: "POST", body: { newName } },
  );
}

export function deleteWorker(name: string): Promise<DeleteWorkerResult> {
  return request<DeleteWorkerResult>(
    `/api/workers/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}
