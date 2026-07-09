import type { IssueRecord } from "@server/schemas";

export interface IssueNode {
  issue: IssueRecord;
  children: IssueNode[];
}

export function parentOf(issue: IssueRecord): string | undefined {
  return "partOf" in issue ? issue.partOf : undefined;
}

function bySequence(a: IssueRecord, b: IssueRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildTree(issues: IssueRecord[]): IssueNode[] {
  const childrenOf = new Map<string, IssueRecord[]>();
  for (const issue of issues) {
    const parent = parentOf(issue);
    if (!parent) continue;
    const bucket = childrenOf.get(parent) ?? [];
    bucket.push(issue);
    childrenOf.set(parent, bucket);
  }

  const toNode = (issue: IssueRecord): IssueNode => ({
    issue,
    children: (childrenOf.get(issue.id) ?? []).sort(bySequence).map(toNode),
  });

  return issues
    .filter((issue) => issue.kind === "epic")
    .sort(bySequence)
    .map(toNode);
}
