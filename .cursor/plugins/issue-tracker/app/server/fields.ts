import {
  MERGE_POLICIES,
  type IssueKind,
  type IssuePatch,
  type MergePolicy,
} from "./schemas.js";

/** Default git base for a root Story (no `stackedOn`). */
export const EPIC_BASE = "main";

/** Display token for an unset tree/detail chip (`base=(unset)`, `branch=(unset)`). */
export const CHIP_UNSET = "(unset)";

export const COMMON_MERGEABLE_KEYS = [
  "title",
  "assignee",
  "needsAttention",
  "attentionReason",
  "archived",
  "partOf",
  "order",
] as const;

export const PROJECT_FIELD_KEYS = ["workspace", "mergePolicy"] as const;

export const EPIC_FIELD_KEYS = ["blockedBy"] as const;

// Story fields the manual edit form renders. Imperative-only runtime keys
// (e.g. specReview) live in STORY_IMPERATIVE_ONLY_KEYS and are excluded.
export const STORY_FORM_FIELD_KEYS = [
  "branchName",
  "stackedOn",
  "prUrl",
  "merged",
] as const;

export const STORY_IMPERATIVE_ONLY_KEYS = ["specReview", "mergeBase"] as const;

export const STORY_FIELD_KEYS = [
  ...STORY_FORM_FIELD_KEYS,
  ...STORY_IMPERATIVE_ONLY_KEYS,
] as const;

// Optional story runtime state preserved by apply when already set on disk.
export const STORY_RUNTIME_OPTIONAL_KEYS = [
  "branchName",
  "mergeBase",
  "prUrl",
  "specReview",
] as const;

// Task fields the manual edit form renders. Imperative-only runtime keys
// (e.g. noDiff) live in TASK_IMPERATIVE_ONLY_KEYS and are excluded.
export const TASK_FORM_FIELD_KEYS = ["status", "commitSha"] as const;

export const TASK_IMPERATIVE_ONLY_KEYS = ["noDiff"] as const;

export const TASK_RUNTIME_OPTIONAL_KEYS = TASK_IMPERATIVE_ONLY_KEYS;

// Optional task fields preserved by apply when already set on disk.
export const TASK_OPTIONAL_PRESERVE_KEYS = [
  "commitSha",
  ...TASK_IMPERATIVE_ONLY_KEYS,
] as const;

export const TASK_FIELD_KEYS = [
  ...TASK_FORM_FIELD_KEYS,
  ...TASK_IMPERATIVE_ONLY_KEYS,
] as const;

export type ProjectFieldKey = (typeof PROJECT_FIELD_KEYS)[number];
export type EpicFieldKey = (typeof EPIC_FIELD_KEYS)[number];
export type StoryFormFieldKey = (typeof STORY_FORM_FIELD_KEYS)[number];
export type StoryFieldKey = (typeof STORY_FIELD_KEYS)[number];
export type StoryRuntimeOptionalKey = (typeof STORY_RUNTIME_OPTIONAL_KEYS)[number];
export type TaskFieldKey = (typeof TASK_FIELD_KEYS)[number];

export const KIND_FIELD_KEYS = {
  project: PROJECT_FIELD_KEYS,
  epic: EPIC_FIELD_KEYS,
  story: STORY_FORM_FIELD_KEYS,
  task: TASK_FORM_FIELD_KEYS,
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

// Mergeable patch keys cleared when patched with `false` (absent-until-true booleans).
export const FALSE_CLEARS_KEYS = ["noDiff"] as const satisfies readonly (keyof IssuePatch)[];

export type FalseClearsKey = (typeof FALSE_CLEARS_KEYS)[number];

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
  archived: "Archived",
  partOf: "Part of",
  order: "Order",
  branchName: "Branch name",
  mergeBase: "Merge base",
  stackedOn: "Stacked on",
  blockedBy: "Blocked by",
  prUrl: "PR URL",
  merged: "Merged",
  specReview: "Spec review",
  status: "Status",
  commitSha: "Commit SHA",
  noDiff: "No diff",
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
  ...STORY_FIELD_KEYS,
  ...TASK_FIELD_KEYS,
] as const satisfies readonly (keyof IssuePatch)[];
