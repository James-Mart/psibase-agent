import { PARENT_KIND, type Issue, type IssueKind, type Problem } from "../schemas.js";
import { branchDependencyIds } from "../order.js";

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

function dependencyCycles(
  issues: Issue[],
  byId: Map<string, Issue>,
): Set<string> {
  const edges = new Map<string, string[]>();
  for (const issue of issues) {
    if (issue.kind !== "branch") continue;
    edges.set(
      issue.id,
      branchDependencyIds(issue).filter(
        (id) => byId.get(id)?.kind === "branch",
      ),
    );
  }

  const inCycle = new Set<string>();
  const visiting = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): void => {
    visiting.add(id);
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      if (visiting.has(next)) {
        for (let i = stack.lastIndexOf(next); i < stack.length; i += 1) {
          inCycle.add(stack[i]);
        }
      } else if (!done.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    visiting.delete(id);
    done.add(id);
  };

  for (const id of edges.keys()) if (!done.has(id)) visit(id);
  return inCycle;
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
        const stackedOn = byId.get(issue.stackedOn);
        if (
          stackedOn?.kind === "branch" &&
          stackedOn.partOf !== issue.partOf
        ) {
          problems.push({
            id: issue.id,
            message: `stackedOn "${issue.stackedOn}" must be in the same Epic`,
          });
        }
      }
      for (const dep of issue.blockedBy) {
        checkReferent(issue, dep, "branch", "blockedBy", byId, problems);
      }
    }
  }

  for (const id of dependencyCycles(issues, byId)) {
    problems.push({
      id,
      message: "part of a stackedOn/blockedBy dependency cycle",
    });
  }

  return problems;
}

export function problemsFor(id: string, issues: Issue[]): Problem[] {
  return checkIntegrity(issues).filter((problem) => problem.id === id);
}
