import type { WorkerStatus } from "./db.js";
import type { ChatError } from "./services/chat.js";

export type PrState = "open" | "closed" | "merged";
export type ReviewDecision = "approved" | "changes_requested" | "review_required";

export interface PrInfo {
  state: PrState;
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
  chatAgentId: string | null;
  chatError: ChatError | null;
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
