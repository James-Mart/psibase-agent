import type { IssueRecord } from "@server/schemas";
import { bySequence, isProjectBoardChild } from "@server/order";
import type { BoardKindFilter } from "./board-kind-filter";

/** Project-board roots (Epic / Idea / project-level Story) in shared `order`. */
export function projectBoardRoots(
  issues: IssueRecord[],
  filter: BoardKindFilter,
): IssueRecord[] {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  let roots = issues
    .filter((issue) => isProjectBoardChild(issue, byId))
    .sort(bySequence);
  if (filter === "epic") {
    roots = roots.filter((issue) => issue.kind === "epic");
  } else if (filter === "idea") {
    roots = roots.filter((issue) => issue.kind === "idea");
  }
  return roots;
}
