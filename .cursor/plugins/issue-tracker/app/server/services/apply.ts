import { parseIssue, type Issue, type IssuePatch } from "../schemas.js";
import type { ApplyDoc, DesiredIssue } from "./apply-schema.js";
import { flattenApplyDoc } from "./apply-schema.js";
import {
  commitIssueBatch,
  readAll,
  readDescription,
  serialize,
  type IssueWrite,
} from "./issues.js";
import { checkIntegrity } from "./integrity.js";
import { IssueError } from "./errors.js";
import { mergeIssue } from "./merge.js";
import { projectSubtreeIds } from "./subtree.js";

// What `apply` changed, by id. On an idempotent re-apply all three are empty.
export interface ApplySummary {
  created: string[];
  updated: string[];
  deleted: string[];
}

// Build the on-disk issue for a desired doc node. Doc-owned fields (title,
// partOf, stackedOn, blockedBy) come from the doc. Imperative/progress fields
// (status, commitSha, branchName, prUrl, merged, assignee, needsAttention,
// attentionReason) and `createdAt` are preserved from a same-kind existing
// issue; for a brand-new issue they are left off the draft entirely so
// `parseIssue` fills them from the schema `.default()`s — the same single
// source of truth `create()` seeds from, so the two entry points cannot drift.
// `apply` never reads or writes runtime state beyond preserving it, and never
// touches chat.jsonl. `updatedAt` is set to `now`; callers revert it when
// nothing actually changed so re-apply does not churn timestamps.
function buildIssue(
  desired: DesiredIssue,
  existing: Issue | undefined,
  now: string,
): Issue {
  const draft: Record<string, unknown> = {
    id: desired.id,
    kind: desired.kind,
    title: desired.title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  // A Project carries none of the common status/assignee/attention fields.
  if (desired.kind !== "project") {
    const prior = existing && existing.kind === desired.kind ? existing : undefined;
    draft.partOf = desired.partOf;
    if (prior) {
      draft.needsAttention = prior.needsAttention;
      draft.attentionReason = prior.attentionReason;
      if (prior.assignee !== undefined) draft.assignee = prior.assignee;
    }
  }

  if (desired.kind === "branch") {
    const prior = existing && existing.kind === "branch" ? existing : undefined;
    draft.blockedBy = desired.blockedBy ?? [];
    if (desired.stackedOn) draft.stackedOn = desired.stackedOn;
    if (prior) {
      draft.merged = prior.merged;
      if (prior.branchName !== undefined) draft.branchName = prior.branchName;
      if (prior.prUrl !== undefined) draft.prUrl = prior.prUrl;
    }
  }

  if (desired.kind === "commit") {
    const prior = existing && existing.kind === "commit" ? existing : undefined;
    if (prior) {
      draft.status = prior.status;
      if (prior.commitSha !== undefined) draft.commitSha = prior.commitSha;
    }
  }

  const parsed = parseIssue(draft);
  if (!parsed.ok) throw new IssueError("validation", parsed.message);
  return parsed.issue;
}

// Repair a surviving issue's references into the prune set. In-project branches
// are fully rebuilt from the doc, so only out-of-project survivors can dangle,
// and only via `blockedBy` (the sole cross-Epic edge); `stackedOn` stays within
// one Epic so it never crosses a project boundary. Mirrors the drop rule in
// deletion.ts. Returns the (possibly rewritten) issue and whether it changed.
function repairSurvivor(
  issue: Issue,
  deleteSet: Set<string>,
  now: string,
): { issue: Issue; changed: boolean } {
  if (issue.kind !== "branch") return { issue, changed: false };
  const kept = issue.blockedBy.filter((dep) => !deleteSet.has(dep));
  if (kept.length === issue.blockedBy.length) return { issue, changed: false };
  const patch: IssuePatch = { blockedBy: kept };
  const parsed = parseIssue(mergeIssue(issue, patch));
  if (!parsed.ok) throw new IssueError("validation", parsed.message);
  parsed.issue.updatedAt = now;
  return { issue: parsed.issue, changed: true };
}

// Reconcile the whole declared project subtree to match `doc`: create new
// nodes, update existing ones (preserving imperative/progress state), and prune
// on-disk issues in the project that the doc omits. The entire prospective set
// is validated with a single `checkIntegrity` pass before any write, so a doc
// that would leave the graph broken is refused with no changes on disk. Runs
// inside the shared write chain so it cannot race HTTP/CLI writes.
export function apply(doc: ApplyDoc): Promise<ApplySummary> {
  return serialize(() => {
    const now = new Date().toISOString();
    const desired = flattenApplyDoc(doc);
    const projectId = doc.project.id;

    const { issues } = readAll();
    const onDiskById = new Map(issues.map((issue) => [issue.id, issue]));
    // Scope is bounded to the declared project's on-disk subtree; anything else
    // is untouched except for reference repair when a pruned branch is a blocker.
    const scope = projectSubtreeIds(issues, projectId);
    const desiredIds = new Set(desired.map((node) => node.id));

    const created: string[] = [];
    const updated: string[] = [];
    // Full prospective issue set, keyed by id, that must pass integrity as a whole.
    const prospective = new Map<string, Issue>();
    // Writes to commit only after integrity passes.
    const writes: IssueWrite[] = [];

    for (const node of desired) {
      const existing = onDiskById.get(node.id);
      if (existing && !scope.has(node.id)) {
        throw new IssueError(
          "validation",
          `cannot apply "${node.id}": id already exists outside project "${projectId}"`,
        );
      }

      const next = buildIssue(node, existing, now);

      if (!existing) {
        prospective.set(next.id, next);
        writes.push({ issue: next, description: node.description ?? `# ${node.title}\n` });
        created.push(next.id);
        continue;
      }

      // Compare with `updatedAt` normalized so an unchanged node keeps its
      // timestamp and is not rewritten. Both objects come from parseIssue, so
      // their key order matches and JSON.stringify is a stable comparison.
      const probe: Issue = { ...next, updatedAt: existing.updatedAt };
      const jsonChanged = JSON.stringify(probe) !== JSON.stringify(existing);
      const descChanged =
        node.description !== undefined &&
        node.description !== readDescription(node.id);

      if (!jsonChanged && !descChanged) {
        prospective.set(existing.id, existing);
        continue;
      }
      prospective.set(next.id, next);
      writes.push({
        issue: next,
        description: descChanged ? node.description : undefined,
      });
      updated.push(next.id);
    }

    // Prune: on-disk issues in the project subtree the doc no longer declares.
    // This deliberately does not delegate to `planDeletion`/`remove()`. That
    // planner's job is to *inherit* a deleted branch's fork point onto surviving
    // stacked branches; here every in-project reference has already been rebuilt
    // from the doc's nesting, so re-inheriting fork points would fight the doc.
    // The only edge that can still dangle is an out-of-project `blockedBy` into
    // the prune set, repaired below (see `repairSurvivor`).
    const deleteSet = new Set(
      [...scope].filter((id) => !desiredIds.has(id)),
    );

    // Fold surviving out-of-project issues (with blockedBy repair) into the set.
    for (const issue of issues) {
      if (deleteSet.has(issue.id) || desiredIds.has(issue.id)) continue;
      const { issue: repaired, changed } = repairSurvivor(issue, deleteSet, now);
      prospective.set(repaired.id, repaired);
      if (changed) writes.push({ issue: repaired });
    }

    const problems = checkIntegrity([...prospective.values()]);
    if (problems.length > 0) {
      throw new IssueError(
        "validation",
        problems.map((p) => p.message).join("; "),
      );
    }

    commitIssueBatch(writes, [...deleteSet]);

    return { created, updated, deleted: [...deleteSet] };
  });
}
