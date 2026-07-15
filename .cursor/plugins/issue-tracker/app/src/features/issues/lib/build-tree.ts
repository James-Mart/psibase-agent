import type { IssueRecord } from "@server/schemas";
import { branchDependencyIds, bySequence } from "@server/order";

export interface IssueNode {
  issue: IssueRecord;
  children: IssueNode[];
}

export function parentOf(issue: IssueRecord): string | undefined {
  return "partOf" in issue ? issue.partOf : undefined;
}

export function issuesById(
  issues: IssueRecord[],
): Map<string, IssueRecord> {
  return new Map(issues.map((issue) => [issue.id, issue]));
}

export function listProjects(issues: IssueRecord[]): IssueRecord[] {
  return issues
    .filter((issue): issue is IssueRecord & { kind: "project" } =>
      issue.kind === "project",
    )
    .sort(bySequence);
}

/** Walk `partOf` to the containing project id, or the id itself if it is a project. */
export function projectIdOf(
  issueId: string,
  byId: Map<string, IssueRecord>,
): string | null {
  let current = byId.get(issueId);
  while (current) {
    if (current.kind === "project") return current.id;
    const parent = parentOf(current);
    if (!parent) return null;
    current = byId.get(parent);
  }
  return null;
}

export function issueBelongsToProject(
  issueId: string,
  projectId: string,
  byId: Map<string, IssueRecord>,
): boolean {
  return projectIdOf(issueId, byId) === projectId;
}

// The ids contained by a project: every issue whose `partOf` chain reaches it
// (its epics, their branches, and those branches' commits), excluding the
// project node itself.
export function filterToProject(
  issues: IssueRecord[],
  projectId: string | null,
): IssueRecord[] {
  if (!projectId) return [];
  const childrenOf = new Map<string, IssueRecord[]>();
  for (const issue of issues) {
    const parent = parentOf(issue);
    if (!parent) continue;
    const bucket = childrenOf.get(parent) ?? [];
    bucket.push(issue);
    childrenOf.set(parent, bucket);
  }
  const kept: IssueRecord[] = [];
  const queue = [...(childrenOf.get(projectId) ?? [])];
  while (queue.length > 0) {
    const issue = queue.shift()!;
    kept.push(issue);
    for (const child of childrenOf.get(issue.id) ?? []) queue.push(child);
  }
  return kept;
}

function branchDeps(branch: IssueRecord, siblings: Set<string>): string[] {
  if (branch.kind !== "branch") return [];
  return branchDependencyIds(branch).filter((id) => siblings.has(id));
}

function orderSiblings(children: IssueRecord[]): IssueRecord[] {
  const sequenced = [...children].sort(bySequence);
  if (!sequenced.every((child) => child.kind === "branch")) return sequenced;

  const ids = new Set(sequenced.map((child) => child.id));
  const placed = new Set<string>();
  const ordered: IssueRecord[] = [];
  while (ordered.length < sequenced.length) {
    const next =
      sequenced.find(
        (child) =>
          !placed.has(child.id) &&
          branchDeps(child, ids).every((dep) => placed.has(dep)),
      ) ?? sequenced.find((child) => !placed.has(child.id));
    if (!next) break;
    ordered.push(next);
    placed.add(next.id);
  }
  return ordered;
}

// Commits first (the branch's own work), then the branches stacked on it.
function orderChildren(children: IssueRecord[]): IssueRecord[] {
  const commits = children
    .filter((child) => child.kind === "commit")
    .sort(bySequence);
  const branches = orderSiblings(
    children.filter((child) => child.kind === "branch"),
  );
  return [...commits, ...branches];
}

export function buildTree(issues: IssueRecord[]): IssueNode[] {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));

  // A branch nests under the branch it forks from (its stackedOn) when that
  // referent is a branch in the same epic and present here; otherwise it falls
  // back to its epic as a root branch.
  const visualParent = (issue: IssueRecord): string | undefined => {
    if (issue.kind === "branch" && issue.stackedOn) {
      const base = byId.get(issue.stackedOn);
      if (base?.kind === "branch" && base.partOf === issue.partOf) {
        return base.id;
      }
    }
    return parentOf(issue);
  };

  const childrenOf = new Map<string, IssueRecord[]>();
  for (const issue of issues) {
    const parent = visualParent(issue);
    if (!parent) continue;
    const bucket = childrenOf.get(parent) ?? [];
    bucket.push(issue);
    childrenOf.set(parent, bucket);
  }

  const toNode = (issue: IssueRecord): IssueNode => ({
    issue,
    children: orderChildren(childrenOf.get(issue.id) ?? []).map(toNode),
  });

  return issues
    .filter((issue) => issue.kind === "epic")
    .sort(bySequence)
    .map(toNode);
}
