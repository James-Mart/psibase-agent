import type { WorkerStatus } from "./db.js";

export type PrState = "open" | "closed" | "merged";

export interface PrInfo {
  state: PrState;
  url: string;
}

export interface WorkerInfo {
  name: string;
  path: string;
  branch: string;
  agentRunning: boolean;
  agentPid: number | null;
  status: WorkerStatus;
  pr: PrInfo | null;
}

export interface UnstagedFile {
  path: string;
  status: string;
}

export interface WorkerDetails {
  unstagedFiles: UnstagedFile[];
  note: string;
  sourceBranch: string;
  pr: PrInfo | null;
}

export interface CreateWorkerResult {
  worktreeName: string | null;
  worktreePath: string | null;
  branch: string;
  output: string;
}

export interface DeleteWorkerResult {
  ok: true;
  branch: string | null;
  branchDeleted: boolean;
  branchDeleteMessage?: string;
  output?: string;
}
