/** Used when the create form leaves source branch blank (matches create-worker.sh). */
export const DEFAULT_SOURCE_BRANCH = "origin/main";

export interface WorkerInfo {
  name: string;
  path: string;
  branch: string;
  agentRunning: boolean;
  agentPid: number | null;
}

export interface CreateWorkerResult {
  worktreeName: string | null;
  worktreePath: string | null;
  branch: string;
  output: string;
}

/** Thrown when POST /api/workers fails; carries optional script output for the UI. */
export class CreateWorkerError extends Error {
  readonly stderr?: string;
  readonly output?: string;

  constructor(message: string, opts?: { stderr?: string; output?: string }) {
    super(message);
    this.name = "CreateWorkerError";
    this.stderr = opts?.stderr;
    this.output = opts?.output;
  }
}

export async function fetchWorkers(): Promise<WorkerInfo[]> {
  const res = await fetch("/api/workers");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWorker(
  branch: string,
  sourceBranch?: string,
): Promise<CreateWorkerResult> {
  const resolved =
    sourceBranch?.trim() || DEFAULT_SOURCE_BRANCH;
  const res = await fetch("/api/workers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, sourceBranch: resolved }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      typeof data.error === "string" ? data.error : "Failed to create worker";
    const stderr =
      typeof data.stderr === "string" ? data.stderr : undefined;
    const output =
      typeof data.output === "string" ? data.output : undefined;
    throw new CreateWorkerError(msg, { stderr, output });
  }
  return data as unknown as CreateWorkerResult;
}

export async function startAgent(name: string): Promise<{ pid: number }> {
  const res = await fetch(`/api/workers/${name}/start`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to start agent");
  return data;
}

export async function stopAgent(name: string): Promise<void> {
  const res = await fetch(`/api/workers/${name}/stop`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to stop agent");
}

export interface FileEntry {
  path: string;
  status: string;
}

export interface WorkerDetails {
  unstagedFiles: FileEntry[];
  note: string;
}

export async function fetchWorkerDetails(
  name: string,
): Promise<WorkerDetails> {
  const res = await fetch(`/api/workers/${name}/details`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveWorkerNote(
  name: string,
  note: string,
): Promise<void> {
  const res = await fetch(`/api/workers/${name}/note`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to save note");
  }
}

export async function renameWorker(
  name: string,
  newName: string,
): Promise<{ newName: string }> {
  const res = await fetch(`/api/workers/${name}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to rename worker");
  return data;
}

export interface DeleteWorkerResult {
  ok: boolean;
  branch: string | null;
  branchDeleted: boolean;
  branchDeleteMessage?: string;
  output?: string;
}

export async function deleteWorker(name: string): Promise<DeleteWorkerResult> {
  const res = await fetch(
    `/api/workers/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Failed to delete worker",
    );
  }
  return data as unknown as DeleteWorkerResult;
}
