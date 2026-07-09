import type { BranchStatus, CommitStatus, EpicStatus } from "@server/schemas";

export const COMMIT_STATUS_CLASS: Record<CommitStatus, string> = {
  todo: "text-muted-foreground",
  "in-progress": "[color:hsl(var(--warning))]",
  done: "[color:hsl(var(--success))]",
};

export const BRANCH_STATUS_LABEL: Record<BranchStatus, string> = {
  "not-started": "not started",
  "in-progress": "in progress",
  "pr-open": "PR open",
  merged: "merged",
};

export const BRANCH_STATUS_CLASS: Record<BranchStatus, string> = {
  "not-started": "text-muted-foreground",
  "in-progress": "[color:hsl(var(--warning))]",
  "pr-open": "text-foreground",
  merged: "[color:hsl(var(--success))]",
};

export const EPIC_STATUS_LABEL: Record<EpicStatus, string> = {
  todo: "todo",
  "in-progress": "in progress",
  done: "done",
};

export const EPIC_STATUS_CLASS: Record<EpicStatus, string> = {
  todo: "text-muted-foreground",
  "in-progress": "[color:hsl(var(--warning))]",
  done: "[color:hsl(var(--success))]",
};
