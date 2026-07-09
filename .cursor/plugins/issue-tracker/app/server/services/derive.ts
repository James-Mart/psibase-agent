import type {
  BranchStatus,
  DerivedState,
  EpicStatus,
  Issue,
  Problem,
} from "../schemas.js";
import { bySequence } from "../order.js";
import { checkIntegrity } from "./integrity.js";

export const EPIC_BASE = "main";

export interface DeriveResult {
  byId: Record<string, DerivedState>;
  ready: string[];
  problems: Problem[];
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

  const branchName = (id: string | undefined): string | undefined => {
    if (!id) return undefined;
    const ref = byId.get(id);
    return ref?.kind === "branch" ? ref.branchName : undefined;
  };
  const isMerged = (id: string): boolean => {
    const ref = byId.get(id);
    return ref?.kind === "branch" ? ref.merged : false;
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
    const baseExists = !branch.stackedOn || branchName(branch.stackedOn) !== undefined;
    const blockersMerged = branch.blockedBy.every(isMerged);
    const branchStatus = branchStatusOf(branch);
    const ready = baseExists && blockersMerged;
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

  for (const epic of issues.filter((i) => i.kind === "epic")) {
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

  const ready = issues
    .filter((issue) => {
      const d = state[issue.id];
      if (!d) return false;
      if (issue.kind === "commit") return d.ready;
      if (issue.kind === "branch") {
        return d.ready && d.branchStatus === "not-started";
      }
      return false;
    })
    .sort(bySequence)
    .map((issue) => issue.id);

  return { byId: state, ready, problems };
}
