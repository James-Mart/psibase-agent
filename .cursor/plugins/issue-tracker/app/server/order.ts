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
