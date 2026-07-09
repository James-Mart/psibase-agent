import { PARENT_KIND, type Issue, type IssueKind, type Problem } from "../schemas.js";

function checkReferent(
  issue: Issue,
  refId: string,
  expectedKind: IssueKind,
  relation: string,
  byId: Map<string, Issue>,
  problems: Problem[],
): void {
  const referent = byId.get(refId);
  if (!referent) {
    problems.push({
      id: issue.id,
      message: `${relation} references unknown issue "${refId}"`,
    });
    return;
  }
  if (referent.kind !== expectedKind) {
    problems.push({
      id: issue.id,
      message: `${relation} "${refId}" must be a ${expectedKind}, not a ${referent.kind}`,
    });
  }
}

export function checkIntegrity(issues: Issue[]): Problem[] {
  const problems: Problem[] = [];
  const byId = new Map(issues.map((issue) => [issue.id, issue]));

  for (const issue of issues) {
    const expectedParent = PARENT_KIND[issue.kind];
    if (issue.kind !== "epic" && issue.partOf && expectedParent) {
      checkReferent(
        issue,
        issue.partOf,
        expectedParent,
        "partOf",
        byId,
        problems,
      );
    }
    if (issue.kind === "branch") {
      if (issue.stackedOn) {
        checkReferent(
          issue,
          issue.stackedOn,
          "branch",
          "stackedOn",
          byId,
          problems,
        );
      }
      for (const dep of issue.blockedBy) {
        checkReferent(issue, dep, "branch", "blockedBy", byId, problems);
      }
    }
  }

  return problems;
}

export function problemsFor(id: string, issues: Issue[]): Problem[] {
  return checkIntegrity(issues).filter((problem) => problem.id === id);
}
