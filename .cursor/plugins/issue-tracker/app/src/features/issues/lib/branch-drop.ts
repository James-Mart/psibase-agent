import { stackedOnSubtree } from "@server/order";
import type { IssueRecord } from "@server/schemas";

export const BRANCH_DRAG_MIME = "application/x-issue-branch";

type BranchRecord = Extract<IssueRecord, { kind: "branch" }>;

function branchesOf(issues: IssueRecord[]): BranchRecord[] {
  return issues.filter((i): i is BranchRecord => i.kind === "branch");
}

/** Dragged branch stack (root first); empty when `sourceId` is not a branch. */
export function branchDragStack(
  issues: IssueRecord[],
  sourceId: string,
): BranchRecord[] {
  return stackedOnSubtree(branchesOf(issues), sourceId);
}

/** True when dropping `sourceId` onto branch `targetId` is a legal restack. */
export function canRestackBranchOntoBranch(
  issues: IssueRecord[],
  sourceId: string,
  targetId: string,
): boolean {
  if (sourceId === targetId) return false;
  const stack = branchDragStack(issues, sourceId);
  if (stack.length === 0) return false;
  return !stack.some((b) => b.id === targetId);
}

/** True when dropping `sourceId` onto epic `epicId` is a legal reparent/unstack. */
export function canDropBranchOntoEpic(
  issues: IssueRecord[],
  sourceId: string,
  epicId: string,
): boolean {
  const stack = branchDragStack(issues, sourceId);
  if (stack.length === 0) return false;
  const epic = issues.find((i) => i.id === epicId);
  return epic?.kind === "epic";
}

export function readBranchDragId(dataTransfer: DataTransfer): string | null {
  const id =
    dataTransfer.getData(BRANCH_DRAG_MIME) ||
    dataTransfer.getData("text/plain");
  return id || null;
}
