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
import { parseIssue, type Issue } from "../schemas.js";

/** Default git base for a root Branch (no `stackedOn`). */
export const EPIC_BASE = "main";

/** Display token for an unset tree/detail chip (`base=(unset)`, `branch=(unset)`). */
export const CHIP_UNSET = "(unset)";

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
