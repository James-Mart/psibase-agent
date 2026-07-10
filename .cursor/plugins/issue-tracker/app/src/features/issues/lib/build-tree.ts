import type { IssueRecord } from "@server/schemas";
import { branchDependencyIds, bySequence } from "@server/order";

export interface IssueNode {
  issue: IssueRecord;
  children: IssueNode[];
}

export function parentOf(issue: IssueRecord): string | undefined {
  return "partOf" in issue ? issue.partOf : undefined;
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
