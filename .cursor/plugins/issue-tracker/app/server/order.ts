import type { Issue } from "./schemas.js";

type Sequenced = Pick<Issue, "createdAt" | "id">;

export function bySequence(a: Sequenced, b: Sequenced): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

type BranchLike = Extract<Issue, { kind: "branch" }>;

export function branchDependencyIds(branch: BranchLike): string[] {
  return [...(branch.stackedOn ? [branch.stackedOn] : []), ...branch.blockedBy];
}

// Order a parent Epic's Branches for structural traversal (the tree / a stacked
// PR plan), independent of the merged-gated `ready` set. Branches are emitted
// depth-first: root Branches (no `stackedOn`, or a `stackedOn` outside this set)
// first, each immediately followed by the Branches stacked on it, recursively.
// Siblings at every level are tie-broken by `bySequence`. Only `stackedOn`
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
