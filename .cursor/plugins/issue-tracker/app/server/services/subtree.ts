import type { Issue } from "../schemas.js";

// The set of ids contained by a project: the project itself plus every issue
// transitively `partOf` it (epics, their branches, and those branches' commits).
// Shared by the CLI's project-scoped views and by `apply`, which uses it to bound
// the reconcile/prune scope to a single project's subtree.
export function projectSubtreeIds(
  issues: Issue[],
  projectId: string,
): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const issue of issues) {
    if (issue.kind === "project") continue;
    const bucket = childrenOf.get(issue.partOf) ?? [];
    bucket.push(issue.id);
    childrenOf.set(issue.partOf, bucket);
  }
  const ids = new Set<string>();
  const queue = [projectId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (ids.has(current)) continue;
    ids.add(current);
    for (const child of childrenOf.get(current) ?? []) queue.push(child);
  }
  return ids;
}
