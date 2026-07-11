import type {
  BranchStatus,
  DerivedState,
  EpicStatus,
  Issue,
  Problem,
} from "../schemas.js";
import { bySequence, stackedBranchOrder } from "../order.js";
import { checkIntegrity } from "./integrity.js";

export const EPIC_BASE = "main";

export interface DeriveResult {
  byId: Record<string, DerivedState>;
  ready: string[];
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

function readyInStructuralOrder(
  issues: Issue[],
  state: Record<string, DerivedState>,
): string[] {
  const epicsOf = new Map<string, Issue[]>();
  const branchesOf = new Map<string, Branch[]>();
  const commitsOf = new Map<string, Commit[]>();
  const projects = issues.filter((i) => i.kind === "project").sort(bySequence);

  for (const issue of issues) {
    if (issue.kind === "epic") {
      const bucket = epicsOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      epicsOf.set(issue.partOf, bucket);
    } else if (issue.kind === "branch") {
      const bucket = branchesOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      branchesOf.set(issue.partOf, bucket);
    } else if (issue.kind === "commit") {
      const bucket = commitsOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      commitsOf.set(issue.partOf, bucket);
    }
  }
  for (const bucket of epicsOf.values()) bucket.sort(bySequence);
  for (const bucket of commitsOf.values()) bucket.sort(bySequence);

  const ready: string[] = [];
  const consider = (id: string, issue: Issue): void => {
    const d = state[id];
    if (!d) return;
    if (issue.kind === "commit" && d.ready) ready.push(id);
    if (
      issue.kind === "branch" &&
      d.ready &&
      d.branchStatus === "not-started"
    ) {
      ready.push(id);
    }
  };

  for (const project of projects) {
    for (const epic of epicsOf.get(project.id) ?? []) {
      if (state[epic.id]?.blocked) continue; // a blocked Epic surfaces nothing
      const branches = stackedBranchOrder(branchesOf.get(epic.id) ?? []);
      for (const branch of branches) {
        consider(branch.id, branch);
        for (const commit of commitsOf.get(branch.id) ?? []) {
          consider(commit.id, commit);
        }
      }
    }
  }
  return ready;
}

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

  const branchName = (id: string | undefined): string | undefined => {
    if (!id) return undefined;
    const ref = byId.get(id);
    return ref?.kind === "branch" ? ref.branchName : undefined;
  };

  // A stacked Branch forks its parent's tip, so it is ready once the parent's
  // tip exists (it has a `branchName`) and the parent's commits are all `done`
  // (no merge gate). A parent with no `branchName` is not-started: there is no
  // tip to fork yet, so the child must stay blocked (guarding against the
  // vacuous `[].every(...)` on a parent with zero commits). A root Branch (no
  // `stackedOn`) has no parent to wait on and is ready immediately.
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
    const base = branchName(branch.stackedOn) ?? EPIC_BASE;
    const branchStatus = branchStatusOf(branch);
    const ready = parentTipDone(branch);
    state[branch.id] = {
      ready,
      blocked: branchStatus === "not-started" && !ready,
      branchStatus,
      base,
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
    const ready = commit.status === "todo" && hasBranch && earlierDone;
    state[commit.id] = {
      ready,
      blocked: commit.status === "todo" && !ready,
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
    state[epic.id] = { ready: false, blocked: false, epicStatus };
  }

  // An Epic is blocked while any Epic it `blockedBy` is not done (done = all its
  // Branches merged). Computed in a second pass so every Epic's status is known.
  for (const epic of epics) {
    const derived = state[epic.id];
    if (derived)
      derived.blocked = epic.blockedBy.some((dep) => !epicIsDone(state[dep]));
  }

  const ready = readyInStructuralOrder(issues, state);

  return { byId: state, ready, problems };
}
