import {
  COMMIT_STATUSES,
  MERGE_POLICIES,
  SPEC_REVIEW_STATUSES,
  type IssueKind,
} from "./schemas.js";
import { CLEARABLE_KEYS } from "./fields.js";

export type FieldCoerce =
  | { type: "string" }
  | { type: "boolean" }
  | { type: "enum"; values: readonly string[] }
  | { type: "json" }
  | { type: "array" }
  | { type: "description" }
  | { type: "needsAttention" }
  | { type: "commitSha" };

export type SetFieldSpec = FieldCoerce;

export const PROJECT_SET_FIELDS = {
  title: { type: "string" },
  workspace: { type: "string" },
  mergePolicy: { type: "enum", values: MERGE_POLICIES },
  description: { type: "description" },
} as const satisfies Record<string, SetFieldSpec>;

export const EPIC_SET_FIELDS = {
  title: { type: "string" },
  assignee: { type: "string" },
  needsAttention: { type: "needsAttention" },
  partOf: { type: "string" },
  blockedBy: { type: "array" },
  description: { type: "description" },
} as const satisfies Record<string, SetFieldSpec>;

export const BRANCH_SET_FIELDS = {
  title: { type: "string" },
  assignee: { type: "string" },
  needsAttention: { type: "needsAttention" },
  partOf: { type: "string" },
  branchName: { type: "string" },
  stackedOn: { type: "string" },
  prUrl: { type: "string" },
  merged: { type: "boolean" },
  specReview: { type: "enum", values: SPEC_REVIEW_STATUSES },
  description: { type: "description" },
} as const satisfies Record<string, SetFieldSpec>;

export const COMMIT_SET_FIELDS = {
  title: { type: "string" },
  assignee: { type: "string" },
  needsAttention: { type: "needsAttention" },
  partOf: { type: "string" },
  status: { type: "enum", values: COMMIT_STATUSES },
  commitSha: { type: "commitSha" },
  noDiff: { type: "boolean" },
  description: { type: "description" },
} as const satisfies Record<string, SetFieldSpec>;

export const KIND_SET_FIELDS = {
  project: PROJECT_SET_FIELDS,
  epic: EPIC_SET_FIELDS,
  branch: BRANCH_SET_FIELDS,
  commit: COMMIT_SET_FIELDS,
} as const satisfies Record<IssueKind, Record<string, SetFieldSpec>>;

export type GetFieldSource = "stored" | "description" | "derived";

export type GetFieldSpec = {
  source: GetFieldSource;
};

const STORED = { source: "stored" } as const satisfies GetFieldSpec;
const DESCRIPTION = { source: "description" } as const satisfies GetFieldSpec;
const DERIVED = { source: "derived" } as const satisfies GetFieldSpec;

export const PROJECT_GET_FIELDS = {
  id: STORED,
  kind: STORED,
  title: STORED,
  workspace: STORED,
  mergePolicy: STORED,
  order: STORED,
  createdAt: STORED,
  updatedAt: STORED,
  description: DESCRIPTION,
} as const satisfies Record<string, GetFieldSpec>;

export const EPIC_GET_FIELDS = {
  id: STORED,
  kind: STORED,
  title: STORED,
  partOf: STORED,
  assignee: STORED,
  needsAttention: STORED,
  attentionReason: STORED,
  blockedBy: STORED,
  order: STORED,
  createdAt: STORED,
  updatedAt: STORED,
  description: DESCRIPTION,
  epicStatus: DERIVED,
  blocked: DERIVED,
} as const satisfies Record<string, GetFieldSpec>;

export const BRANCH_GET_FIELDS = {
  id: STORED,
  kind: STORED,
  title: STORED,
  partOf: STORED,
  assignee: STORED,
  needsAttention: STORED,
  attentionReason: STORED,
  branchName: STORED,
  mergeBase: STORED,
  stackedOn: STORED,
  prUrl: STORED,
  merged: STORED,
  specReview: STORED,
  order: STORED,
  createdAt: STORED,
  updatedAt: STORED,
  description: DESCRIPTION,
  branchStatus: DERIVED,
  blocked: DERIVED,
  base: DERIVED,
} as const satisfies Record<string, GetFieldSpec>;

export const COMMIT_GET_FIELDS = {
  id: STORED,
  kind: STORED,
  title: STORED,
  partOf: STORED,
  assignee: STORED,
  needsAttention: STORED,
  attentionReason: STORED,
  status: STORED,
  commitSha: STORED,
  noDiff: STORED,
  order: STORED,
  createdAt: STORED,
  updatedAt: STORED,
  description: DESCRIPTION,
  blocked: DERIVED,
} as const satisfies Record<string, GetFieldSpec>;

export const KIND_GET_FIELDS = {
  project: PROJECT_GET_FIELDS,
  epic: EPIC_GET_FIELDS,
  branch: BRANCH_GET_FIELDS,
  commit: COMMIT_GET_FIELDS,
} as const satisfies Record<IssueKind, Record<string, GetFieldSpec>>;

const clearableSet = new Set<string>(CLEARABLE_KEYS);

export function isClearableSetField(field: string): boolean {
  return clearableSet.has(field);
}
