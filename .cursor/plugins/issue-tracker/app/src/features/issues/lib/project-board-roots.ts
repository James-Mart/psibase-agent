import type { IssueRecord } from "@server/schemas";
import { bySequence, isProjectBoardChild } from "@server/order";
import type { BoardKindFilter } from "./board-kind-filter";

/** Project-board roots (Epic / Idea) in shared `order`, optionally filtered by kind. */
export function projectBoardRoots(
  issues: IssueRecord[],
  filter: BoardKindFilter,
): IssueRecord[] {
  let roots = issues.filter(isProjectBoardChild).sort(bySequence);
  if (filter === "epic") {
    roots = roots.filter((issue) => issue.kind === "epic");
  } else if (filter === "idea") {
    roots = roots.filter((issue) => issue.kind === "idea");
  }
  return roots;
}
