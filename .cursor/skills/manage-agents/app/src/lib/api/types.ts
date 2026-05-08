export const DEFAULT_SOURCE_BRANCH = "origin/main";

export type WorkerStatus = "active" | "blocked" | "inactive";

export type ReviewDecision = "approved" | "changes_requested" | "review_required";

export interface PrInfo {
  state: "open" | "closed" | "merged";
  url: string;
  reviewDecision: ReviewDecision | null;
  unresolvedThreads: number;
}

export interface WorkerInfo {
  name: string;
  path: string;
  branch: string;
  agentRunning: boolean;
  agentPid: number | null;
  status: WorkerStatus;
  pr: PrInfo | null;
  isMain?: boolean;
  chainPort: number | null;
}

export interface FileEntry {
  path: string;
  status: string;
}

export interface WorkerDetails {
  unstagedFiles: FileEntry[];
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
  ok: boolean;
  branch: string | null;
  branchDeleted: boolean;
  branchDeleteMessage?: string;
  output?: string;
}
