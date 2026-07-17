import type {
  BranchStatus,
  DerivedState,
  EpicStatus,
  Issue,
  Problem,
} from "../schemas.js";
import { bySequence } from "../order.js";
import { checkIntegrity } from "./integrity.js";

export interface DeriveResult {
  byId: Record<string, DerivedState>;
  problems: Problem[];
}

// An Epic counts as "done" (and so stops blocking its dependents) once its
// derived status is `done` — all its Branches merged. The single source for
// this predicate: consumed by the blocked pass below and by the UI's
// per-dependency badge so both read the same rule.
export function epicIsDone(state: DerivedState | undefined): boolean {
  return state?.epicStatus === "done";
}

type Branch = Extract<Issue, { kind: "branch" }>;
type Commit = Extract<Issue, { kind: "commit" }>;

export function derive(issues: Issue[]): DeriveResult {
  const problems = checkIntegrity(issues);
  const byId = new Map(issues.map((issue) => [issue.id, issue]));

  const commitsOf = new Map<string, Commit[]>();
  const branchesOf = new Map<string, Branch[]>();
  for (const issue of issues) {
    if (issue.kind === "commit") {
      const bucket = commitsOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      commitsOf.set(issue.partOf, bucket);
    } else if (issue.kind === "branch") {
      const bucket = branchesOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      branchesOf.set(issue.partOf, bucket);
    }
  }
  for (const bucket of commitsOf.values()) bucket.sort(bySequence);

  const state: Record<string, DerivedState> = {};

  // A stacked Branch forks its parent's tip, so it is not blocked once the parent's
  // tip exists (it has a `branchName`) and the parent's commits are all `done`
  // (no merge gate). A parent with no `branchName` is not-started: there is no
  // tip to fork yet, so the child stays blocked (guarding against the vacuous
  // `[].every(...)` on a parent with zero commits). A root Branch (no
  // `stackedOn`) has no parent to wait on and is not blocked.
  const parentTipDone = (branch: Branch): boolean => {
    if (!branch.stackedOn) return true;
    const parent = byId.get(branch.stackedOn);
    if (parent?.kind !== "branch") return false;
    if (!parent.branchName) return false;
    return (commitsOf.get(parent.id) ?? []).every((c) => c.status === "done");
  };

  const branchStatusOf = (branch: Branch): BranchStatus => {
    if (branch.merged) return "merged";
    const children = commitsOf.get(branch.id) ?? [];
    const allDone = children.every((c) => c.status === "done");
    if (children.length > 0 && allDone && branch.prUrl) return "pr-open";
    if (branch.branchName) return "in-progress";
    return "not-started";
  };

  for (const branch of issues.filter((i): i is Branch => i.kind === "branch")) {
    // `base` is the stored `mergeBase` only — never re-derived from `stackedOn`.
    // When unset, omit it so the tree chip shows `base=(unset)`.
    const branchStatus = branchStatusOf(branch);
    state[branch.id] = {
      blocked: branchStatus === "not-started" && !parentTipDone(branch),
      branchStatus,
      ...(branch.mergeBase !== undefined ? { base: branch.mergeBase } : {}),
    };
  }

  for (const commit of issues.filter((i): i is Commit => i.kind === "commit")) {
    const branch = byId.get(commit.partOf);
    const hasBranch =
      branch?.kind === "branch" && Boolean(branch.branchName) && !branch.merged;
    const siblings = commitsOf.get(commit.partOf) ?? [];
    const earlierDone = siblings
      .slice(0, siblings.indexOf(commit))
      .every((c) => c.status === "done");
    state[commit.id] = {
      blocked:
        commit.status === "todo" && !(hasBranch && earlierDone),
    };
  }

  const epics = issues.filter((i) => i.kind === "epic");
  for (const epic of epics) {
    const branches = branchesOf.get(epic.id) ?? [];
    const started = branches.filter(
      (b) => state[b.id]?.branchStatus !== "not-started",
    );
    const epicStatus: EpicStatus =
      branches.length > 0 && branches.every((b) => b.merged)
        ? "done"
        : started.length > 0
          ? "in-progress"
          : "todo";
    state[epic.id] = { blocked: false, epicStatus };
  }

  // An Epic is blocked while any Epic it `blockedBy` is not done (done = all its
  // Branches merged). Computed in a second pass so every Epic's status is known.
  for (const epic of epics) {
    const derived = state[epic.id];
    if (derived)
      derived.blocked = epic.blockedBy.some((dep) => !epicIsDone(state[dep]));
  }

  return { byId: state, problems };
}
