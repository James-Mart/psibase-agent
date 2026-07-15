import {
  MERGE_POLICIES,
  type IssueKind,
  type IssuePatch,
  type MergePolicy,
} from "./schemas.js";

export const COMMON_MERGEABLE_KEYS = [
  "title",
  "assignee",
  "needsAttention",
  "attentionReason",
  "partOf",
  "order",
] as const;

export const PROJECT_FIELD_KEYS = ["workspace", "mergePolicy"] as const;

export const EPIC_FIELD_KEYS = ["blockedBy"] as const;

// Branch fields the manual edit form renders. Imperative-only runtime keys
// (e.g. specReview) live in BRANCH_IMPERATIVE_ONLY_KEYS and are excluded.
export const BRANCH_FORM_FIELD_KEYS = [
  "branchName",
  "stackedOn",
  "prUrl",
  "merged",
] as const;

export const BRANCH_IMPERATIVE_ONLY_KEYS = ["specReview"] as const;

export const BRANCH_FIELD_KEYS = [
  ...BRANCH_FORM_FIELD_KEYS,
  ...BRANCH_IMPERATIVE_ONLY_KEYS,
] as const;

// Optional branch runtime state preserved by apply when already set on disk.
export const BRANCH_RUNTIME_OPTIONAL_KEYS = [
  "branchName",
  "prUrl",
  "specReview",
] as const;

export const COMMIT_FIELD_KEYS = ["status", "commitSha"] as const;

export type ProjectFieldKey = (typeof PROJECT_FIELD_KEYS)[number];
export type EpicFieldKey = (typeof EPIC_FIELD_KEYS)[number];
export type BranchFormFieldKey = (typeof BRANCH_FORM_FIELD_KEYS)[number];
export type BranchFieldKey = (typeof BRANCH_FIELD_KEYS)[number];
export type BranchRuntimeOptionalKey = (typeof BRANCH_RUNTIME_OPTIONAL_KEYS)[number];
export type CommitFieldKey = (typeof COMMIT_FIELD_KEYS)[number];

export const KIND_FIELD_KEYS = {
  project: PROJECT_FIELD_KEYS,
  epic: EPIC_FIELD_KEYS,
  branch: BRANCH_FORM_FIELD_KEYS,
  commit: COMMIT_FIELD_KEYS,
} as const satisfies Record<IssueKind, readonly string[]>;

export const CLEARABLE_KEYS = [
  "assignee",
  "commitSha",
  "branchName",
  "stackedOn",
  "prUrl",
  "workspace",
] as const;

export type ClearableKey = (typeof CLEARABLE_KEYS)[number];

// Mergeable patch keys that must not be cleared with null (unlike workspace).
export const NON_CLEARABLE_MERGEABLE_KEYS = ["mergePolicy"] as const satisfies readonly (keyof IssuePatch)[];

export type NonClearableMergeableKey = (typeof NON_CLEARABLE_MERGEABLE_KEYS)[number];

export const FIELD_LABELS = {
  workspace: "Workspace",
  mergePolicy: "Merge policy",
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
  specReview: "Spec review",
  status: "Status",
  commitSha: "Commit SHA",
} as const;

export const MERGE_POLICY_LABELS = {
  merge: "Merge",
  "pull-request": "Pull request",
  manual: "Manual",
} as const satisfies Record<MergePolicy, string>;

export const MERGE_POLICY_OPTIONS = MERGE_POLICIES.map((value) => ({
  value,
  label: MERGE_POLICY_LABELS[value],
}));

export const MERGEABLE_KEYS = [
  ...COMMON_MERGEABLE_KEYS,
  ...PROJECT_FIELD_KEYS,
  ...EPIC_FIELD_KEYS,
  ...BRANCH_FIELD_KEYS,
  ...COMMIT_FIELD_KEYS,
] as const satisfies readonly (keyof IssuePatch)[];
