import type { IssueKind, IssuePatch } from "./schemas.js";

export const COMMON_MERGEABLE_KEYS = [
  "title",
  "assignee",
  "needsAttention",
  "attentionReason",
  "partOf",
  "order",
] as const;

export const BRANCH_FIELD_KEYS = [
  "branchName",
  "stackedOn",
  "blockedBy",
  "prUrl",
  "merged",
] as const;

export const COMMIT_FIELD_KEYS = ["status", "commitSha"] as const;

export type BranchFieldKey = (typeof BRANCH_FIELD_KEYS)[number];
export type CommitFieldKey = (typeof COMMIT_FIELD_KEYS)[number];

export const KIND_FIELD_KEYS = {
  project: [],
  epic: [],
  branch: BRANCH_FIELD_KEYS,
  commit: COMMIT_FIELD_KEYS,
} as const satisfies Record<IssueKind, readonly string[]>;

export const CLEARABLE_KEYS = [
  "assignee",
  "commitSha",
  "branchName",
  "stackedOn",
  "prUrl",
] as const;

export type ClearableKey = (typeof CLEARABLE_KEYS)[number];

export const FIELD_LABELS = {
  title: "Title",
  assignee: "Assignee",
  needsAttention: "Needs attention",
  attentionReason: "Attention reason",
  partOf: "Part of",
  order: "Order",
  branchName: "Branch name",
  stackedOn: "Stacked on",
  blockedBy: "Blocked by",
  prUrl: "PR URL",
  merged: "Merged",
  status: "Status",
  commitSha: "Commit SHA",
} as const;

export const MERGEABLE_KEYS = [
  ...COMMON_MERGEABLE_KEYS,
  ...BRANCH_FIELD_KEYS,
  ...COMMIT_FIELD_KEYS,
] as const satisfies readonly (keyof IssuePatch)[];
