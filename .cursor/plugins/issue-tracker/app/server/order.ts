import type { Issue, IssueKind } from "./schemas.js";

type Sequenced = Pick<Issue, "order">;

export function bySequence(a: Sequenced, b: Sequenced): number {
  return a.order - b.order;
}

// The sibling group an issue's `order` is unique within: same parent, and for
// Branches also the same fork point, so root Branches (no `stackedOn`) share one
// bucket and each stack shares another — matching the DFS traversal below and
// the readiness walk in derive.ts. Projects share a single global group. This is
// the one definition of "siblings"; both the integrity duplicate-order check and
// the append math in the writers key off it so they can never disagree.
function groupKeyFor(
  kind: IssueKind,
  partOf: string | undefined,
  stackedOn: string | undefined,
): string {
  switch (kind) {
    case "project":
      return "project";
    case "epic":
      return `epic:${partOf}`;
    case "commit":
      return `commit:${partOf}`;
    case "branch":
      return `branch:${partOf}:${stackedOn ?? ""}`;
  }
}

export function siblingGroupKey(issue: Issue): string {
  return groupKeyFor(
    issue.kind,
    "partOf" in issue ? issue.partOf : undefined,
    issue.kind === "branch" ? issue.stackedOn : undefined,
  );
}

// The next free `order` for a new node in a sibling group: one past the current
// max (append), or 0 when the group is empty. `excludeId` drops the node itself
// when recomputing on a move. Shared by imperative `create`/reparent and by
// `apply` for a brand-new root node, so a new sibling never collides at 0.
export function nextSiblingOrder(
  issues: Issue[],
  kind: IssueKind,
  partOf: string | undefined,
  stackedOn: string | undefined,
  excludeId?: string,
): number {
  const key = groupKeyFor(kind, partOf, stackedOn);
  let max = -1;
  for (const issue of issues) {
    if (issue.id === excludeId) continue;
    if (siblingGroupKey(issue) !== key) continue;
    if (issue.order > max) max = issue.order;
  }
  return max + 1;
}

type BranchLike = Extract<Issue, { kind: "branch" }>;

export function branchDependencyIds(branch: BranchLike): string[] {
  return [...(branch.stackedOn ? [branch.stackedOn] : []), ...branch.blockedBy];
}

// Order a parent Epic's Branches for structural traversal (the tree / a stacked
// PR plan), independent of the merged-gated `ready` set. Branches are emitted
// depth-first: root Branches (no `stackedOn`, or a `stackedOn` outside this set)
// first, each immediately followed by the Branches stacked on it, recursively.
// Siblings at every level are ordered by stored `order`. Only `stackedOn`
// nests here; `blockedBy` is a cross-Epic dependency, not a fork point, so it
// does not affect this order. Generic over the branch shape so the CLI (with
// its `IssueRecord` branches) and a future SDK script can share one traversal.
export function stackedBranchOrder<T extends BranchLike>(branches: T[]): T[] {
  const inSet = new Set(branches.map((b) => b.id));
  const roots: T[] = [];
  const childrenOf = new Map<string, T[]>();
  for (const branch of branches) {
    if (branch.stackedOn && inSet.has(branch.stackedOn)) {
      const bucket = childrenOf.get(branch.stackedOn) ?? [];
      bucket.push(branch);
      childrenOf.set(branch.stackedOn, bucket);
    } else {
      roots.push(branch);
    }
  }
  roots.sort(bySequence);
  for (const bucket of childrenOf.values()) bucket.sort(bySequence);

  const ordered: T[] = [];
  const seen = new Set<string>();
  const visit = (branch: T): void => {
    if (seen.has(branch.id)) return; // defensive: a stackedOn cycle is a problem
    seen.add(branch.id);
    ordered.push(branch);
    for (const child of childrenOf.get(branch.id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return ordered;
}
