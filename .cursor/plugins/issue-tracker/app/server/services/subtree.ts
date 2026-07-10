import type { Issue } from "../schemas.js";

// The set of ids in an issue's subtree: the root itself plus every issue
// transitively `partOf` it. Rooted at a Project it yields the whole project
// (epics, their branches, and those branches' commits); rooted at an Epic it
// yields that Epic's branches and commits; rooted at a Branch it yields just
// that branch and its commits (stacked children are `partOf` the Epic, so they
// are not included). Shared by the CLI's project-scoped views and by `apply`,
// which uses it to bound the reconcile/prune scope to the declared root.
export function subtreeIds(
  issues: Issue[],
  rootId: string,
): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const issue of issues) {
    if (issue.kind === "project") continue;
    const bucket = childrenOf.get(issue.partOf) ?? [];
    bucket.push(issue.id);
    childrenOf.set(issue.partOf, bucket);
  }
  const ids = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (ids.has(current)) continue;
    ids.add(current);
    for (const child of childrenOf.get(current) ?? []) queue.push(child);
  }
  return ids;
}
