import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { issuesDir } from "../config.js";
import { parseIssue, type Issue, type IssuePatch } from "../schemas.js";
import { CHIP_UNSET, EPIC_BASE } from "../fields.js";

// Re-exported from the client-safe `fields` module so browser code can read
// these pure constants without pulling this fs-backed module into the bundle.
export { CHIP_UNSET, EPIC_BASE };

const BACKFILL_FLAG = ".merge-base-backfilled";

type Branch = Extract<Issue, { kind: "branch" }>;

function branchById(issues: Issue[]): Map<string, Branch> {
  const map = new Map<string, Branch>();
  for (const issue of issues) {
    if (issue.kind === "branch") map.set(issue.id, issue);
  }
  return map;
}

// Initial `mergeBase` for create / apply of a new Branch.
// Root → `main`. Stacked child → parent's `branchName` when set; otherwise
// leave unset until the parent's first `set-branch-name` cascade.
export function initialMergeBase(
  stackedOn: string | undefined,
  issues: Issue[],
): string | undefined {
  if (!stackedOn) return EPIC_BASE;
  const parent = branchById(issues).get(stackedOn);
  return parent?.branchName;
}

/** Branches whose `stackedOn` is `parentId` (direct children only). */
export function stackedChildren(parentId: string, issues: Issue[]): Branch[] {
  return issues.filter(
    (issue): issue is Branch =>
      issue.kind === "branch" && issue.stackedOn === parentId,
  );
}

/**
 * First-time `set-branch-name` cascade: children with empty `mergeBase` get
 * the parent's new `branchName`. Children that already have a `mergeBase`
 * (e.g. retargeted by `set-merged`) are left alone.
 */
export function planBranchNameMergeBaseCascade(
  parentId: string,
  branchName: string,
  issues: Issue[],
): { id: string; mergeBase: string }[] {
  return stackedChildren(parentId, issues)
    .filter((child) => child.mergeBase === undefined)
    .map((child) => ({ id: child.id, mergeBase: branchName }));
}

/**
 * `set-merged` cascade: every stacked child retargets to the parent's
 * `mergeBase`. Idempotent when a child already matches. No-op when the parent
 * has no `mergeBase` to propagate.
 */
export function planMergedMergeBaseCascade(
  parentId: string,
  parentMergeBase: string | undefined,
  issues: Issue[],
): { id: string; mergeBase: string }[] {
  if (parentMergeBase === undefined) return [];
  return stackedChildren(parentId, issues)
    .filter((child) => child.mergeBase !== parentMergeBase)
    .map((child) => ({ id: child.id, mergeBase: parentMergeBase }));
}

export type MergeBaseCascadePatch = { id: string; mergeBase: string };

/**
 * Refuse a real `branchName` change (not a same-value no-op) while any child is
 * stacked on this Branch. Returns an error message, or null when allowed.
 */
export function branchNameRenameError(
  existing: Issue,
  jsonPatch: IssuePatch,
  issues: Issue[],
): string | null {
  if (existing.kind !== "branch" || !existing.branchName) return null;
  if (!("branchName" in jsonPatch) || jsonPatch.branchName === undefined) {
    return null;
  }
  if (jsonPatch.branchName === existing.branchName) return null;
  const children = stackedChildren(existing.id, issues);
  if (children.length === 0) return null;
  const ids = children.map((child) => child.id).join(", ");
  return `cannot change branchName on "${existing.id}" while stacked children exist (${ids})`;
}

/**
 * Decide which stacked children need a `mergeBase` write for this parent update:
 * first-time `branchName` (empty children only) and/or `merged: true` retarget.
 */
export function planMergeBaseCascades(
  existing: Issue,
  jsonPatch: IssuePatch,
  next: Issue,
  issues: Issue[],
): MergeBaseCascadePatch[] {
  if (existing.kind !== "branch" || next.kind !== "branch") return [];

  const patches: MergeBaseCascadePatch[] = [];
  const firstTimeName =
    !existing.branchName &&
    "branchName" in jsonPatch &&
    typeof jsonPatch.branchName === "string" &&
    jsonPatch.branchName.length > 0;
  if (firstTimeName && next.branchName) {
    patches.push(
      ...planBranchNameMergeBaseCascade(next.id, next.branchName, issues),
    );
  }
  if ("merged" in jsonPatch && next.merged) {
    patches.push(
      ...planMergedMergeBaseCascade(next.id, next.mergeBase, issues),
    );
  }

  // If both triggers fire for the same child, last write wins.
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return [...byId.values()];
}

function flagPath(): string {
  return join(issuesDir, BACKFILL_FLAG);
}

export function mergeBaseBackfillDone(): boolean {
  return existsSync(flagPath());
}

// Mark the issues dir as already migrated so intentional post-migration
// absences (stacked child of an unnamed parent) are not filled.
export function markMergeBaseBackfilled(): void {
  mkdirSync(issuesDir, { recursive: true });
  writeFileSync(flagPath(), "");
}

export interface MergeBaseBackfillResult {
  updated: string[];
  skipped: boolean;
}

// Scan on-disk issues for backfill: every parseable issue, plus Branch ids whose
// raw issue.json lacks a `mergeBase` key (intentional post-migration absences
// keep the key absent after the marker exists).
export function readBranchesMissingMergeBaseKey(): {
  issues: Issue[];
  rawMissingMergeBase: string[];
} {
  const issues: Issue[] = [];
  const rawMissingMergeBase: string[] = [];
  if (!existsSync(issuesDir)) return { issues, rawMissingMergeBase };

  for (const id of readdirSync(issuesDir)) {
    const dir = join(issuesDir, id);
    if (!statSync(dir).isDirectory()) continue;
    const jsonPath = join(dir, "issue.json");
    if (!existsSync(jsonPath)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(jsonPath, "utf8"));
    } catch {
      continue;
    }
    const parsed = parseIssue(raw);
    if (!parsed.ok) continue;
    issues.push(parsed.issue);
    if (
      parsed.issue.kind === "branch" &&
      (!raw || typeof raw !== "object" || !("mergeBase" in raw))
    ) {
      rawMissingMergeBase.push(id);
    }
  }
  return { issues, rawMissingMergeBase };
}

// One-time: for every on-disk Branch whose issue.json lacks `mergeBase`, set
// `initialMergeBase(...) ?? main` and persist. Subsequent calls are no-ops
// once the marker file exists (so create's intentional unset survives).
export function ensureMergeBaseBackfilled(
  persistBranch: (issue: Branch) => void,
): MergeBaseBackfillResult {
  if (mergeBaseBackfillDone()) return { updated: [], skipped: true };

  const { issues, rawMissingMergeBase } = readBranchesMissingMergeBaseKey();
  const missing = new Set(rawMissingMergeBase);
  const updated: string[] = [];

  for (const issue of issues) {
    if (issue.kind !== "branch" || !missing.has(issue.id)) continue;
    const mergeBase = initialMergeBase(issue.stackedOn, issues) ?? EPIC_BASE;
    const next: Branch = { ...issue, mergeBase };
    persistBranch(next);
    updated.push(issue.id);
  }

  markMergeBaseBackfilled();
  return { updated, skipped: false };
}
