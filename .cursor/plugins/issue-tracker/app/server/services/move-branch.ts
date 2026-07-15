import { parseIssue, type Issue, type IssuePatch } from "../schemas.js";
import {
  nextSiblingOrder,
  siblingGroupKey,
  stackedOnSubtree,
} from "../order.js";
import {
  commitIssueBatch,
  readAll,
  serialize,
  type IssueWrite,
} from "./issues.js";
import { checkIntegrity } from "./integrity.js";
import { IssueError } from "./errors.js";
import { mergeIssue } from "./merge.js";

export interface MoveBranchResult {
  /** Branch ids in the moved stack (dragged root first, then descendants). */
  moved: string[];
}

type Branch = Extract<Issue, { kind: "branch" }>;

function asBranch(issue: Issue, label: string): Branch {
  if (issue.kind !== "branch") {
    throw new IssueError(
      "validation",
      `${label} must be a branch, not a ${issue.kind}`,
    );
  }
  return issue;
}

function requireIssue(issues: Issue[], id: string): Issue {
  const issue = issues.find((i) => i.id === id);
  if (!issue) {
    throw new IssueError("not_found", `unknown issue "${id}"`);
  }
  return issue;
}

/**
 * Atomically reparent and/or restack a Branch together with every transitive
 * `stackedOn` descendant, validated once via `checkIntegrity` and written with
 * a single `commitIssueBatch`.
 *
 * - Target Branch → restack onto it (reparent the stack into the target's Epic
 *   when that Epic differs).
 * - Target Epic → reparent the stack into that Epic; clears the root's
 *   `stackedOn` (unstack when the Epic is already the current one).
 */
export function moveBranch(
  id: string,
  targetId: string,
): Promise<MoveBranchResult> {
  return serialize(() => {
    const { issues } = readAll();
    const source = asBranch(requireIssue(issues, id), "move-branch source");

    const target = requireIssue(issues, targetId);
    if (target.kind !== "branch" && target.kind !== "epic") {
      throw new IssueError(
        "validation",
        `move-branch target must be a branch or epic, not a ${target.kind}`,
      );
    }

    const branches = issues.filter(
      (i): i is Branch => i.kind === "branch",
    );
    const stack = stackedOnSubtree(branches, source.id);
    const moved = stack.map((b) => b.id);
    const stackSet = new Set(moved);

    let destEpic: string;
    let rootStackedOn: string | null | undefined;

    if (target.kind === "branch") {
      if (stackSet.has(targetId)) {
        throw new IssueError(
          "validation",
          `move-branch would create a stackedOn cycle (target "${targetId}" is in the moved stack)`,
        );
      }
      destEpic = target.partOf;
      rootStackedOn = targetId;
    } else {
      destEpic = targetId;
      rootStackedOn = null;
    }

    const byId = new Map(issues.map((issue) => [issue.id, issue]));
    const now = new Date().toISOString();
    const prospective = new Map(byId);
    const writes: IssueWrite[] = [];

    // Root is first in `moved` (stackedOnSubtree / stackedBranchOrder), so
    // order re-append sees the destination sibling group correctly.
    for (const branchId of moved) {
      const existing = asBranch(
        byId.get(branchId)!,
        `stack member "${branchId}"`,
      );
      const patch: IssuePatch = { partOf: destEpic };
      if (branchId === source.id) {
        patch.stackedOn = rootStackedOn;
      }

      const parsed = parseIssue(mergeIssue(existing, patch));
      if (!parsed.ok) throw new IssueError("validation", parsed.message);
      const branch = asBranch(parsed.issue, `updated "${branchId}"`);

      // Only the dragged root can land in a foreign sibling group; re-append
      // its order there (same rule as a single-branch `update`). Descendants
      // keep relative order — their sibling buckets move as a unit.
      if (
        branchId === source.id &&
        siblingGroupKey(branch) !== siblingGroupKey(existing)
      ) {
        branch.order = nextSiblingOrder(
          [...prospective.values()],
          "branch",
          branch.partOf,
          branch.stackedOn,
          source.id,
        );
      }

      const unchanged =
        branch.partOf === existing.partOf &&
        branch.stackedOn === existing.stackedOn &&
        branch.order === existing.order;
      if (unchanged) continue;

      branch.updatedAt = now;
      prospective.set(branchId, branch);
      writes.push({ issue: branch });
    }

    if (writes.length === 0) {
      return { moved };
    }

    const problems = checkIntegrity([...prospective.values()]);
    if (problems.length > 0) {
      throw new IssueError(
        "validation",
        problems.map((p) => p.message).join("; "),
      );
    }

    commitIssueBatch(writes, []);
    return { moved };
  });
}
