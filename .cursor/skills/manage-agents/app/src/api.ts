export interface WorkerInfo {
  name: string;
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

export async function fetchWorkers(): Promise<WorkerInfo[]> {
  const res = await fetch("/api/workers");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWorker(
  branch: string,
  sourceBranch?: string,
): Promise<CreateWorkerResult> {
  const res = await fetch("/api/workers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, sourceBranch: sourceBranch || undefined }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create worker");
  return data;
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
