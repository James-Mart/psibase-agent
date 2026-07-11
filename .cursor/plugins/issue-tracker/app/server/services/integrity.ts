import { PARENT_KIND, type Issue, type IssueKind, type Problem } from "../schemas.js";
import {
  branchDependencyIds,
  epicDependencyIds,
  siblingGroupKey,
} from "../order.js";

function checkDuplicateOrder(issues: Issue[], problems: Problem[]): void {
  const buckets = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = siblingGroupKey(issue);
    const bucket = buckets.get(key) ?? [];
    bucket.push(issue);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    const seen = new Map<number, string>();
    for (const issue of bucket) {
      const prior = seen.get(issue.order);
      if (prior) {
        problems.push({
          id: issue.id,
          message: `duplicate order ${issue.order} in sibling group (also used by "${prior}")`,
        });
      } else {
        seen.set(issue.order, issue.id);
      }
    }
  }
}

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

// A referent that must not only be `expectedKind` but also share the referring
// issue's parent: a Branch's `stackedOn` peer lives in the same Epic, an Epic's
// `blockedBy` peer in the same Project. Wraps `checkReferent` and adds the
// same-container guard so `stackedOn` and `blockedBy` validation stay one shape.
function checkReferentInSameContainer(
  issue: Issue,
  refId: string,
  expectedKind: IssueKind,
  relation: string,
  container: string,
  byId: Map<string, Issue>,
  problems: Problem[],
): void {
  checkReferent(issue, refId, expectedKind, relation, byId, problems);
  const referent = byId.get(refId);
  const issueParent = "partOf" in issue ? issue.partOf : undefined;
  const referentParent =
    referent && "partOf" in referent ? referent.partOf : undefined;
  if (referent?.kind === expectedKind && referentParent !== issueParent) {
    problems.push({
      id: issue.id,
      message: `${relation} "${refId}" must be in the same ${container}`,
    });
  }
}

function dependencyCycles(
  issues: Issue[],
  byId: Map<string, Issue>,
): Set<string> {
  const edges = new Map<string, string[]>();
  for (const issue of issues) {
    if (issue.kind === "branch") {
      edges.set(
        issue.id,
        branchDependencyIds(issue).filter(
          (id) => byId.get(id)?.kind === "branch",
        ),
      );
    } else if (issue.kind === "epic") {
      edges.set(
        issue.id,
        epicDependencyIds(issue).filter((id) => byId.get(id)?.kind === "epic"),
      );
    }
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
    if (expectedParent && "partOf" in issue && issue.partOf) {
      checkReferent(
        issue,
        issue.partOf,
        expectedParent,
        "partOf",
        byId,
        problems,
      );
    }
    if (issue.kind === "branch" && issue.stackedOn) {
      checkReferentInSameContainer(
        issue,
        issue.stackedOn,
        "branch",
        "stackedOn",
        "Epic",
        byId,
        problems,
      );
    }
    if (issue.kind === "epic") {
      for (const dep of issue.blockedBy) {
        checkReferentInSameContainer(
          issue,
          dep,
          "epic",
          "blockedBy",
          "Project",
          byId,
          problems,
        );
      }
    }
  }

  for (const id of dependencyCycles(issues, byId)) {
    problems.push({
      id,
      message: "part of a stackedOn/blockedBy dependency cycle",
    });
  }

  checkDuplicateOrder(issues, problems);

  return problems;
}

export function problemsFor(id: string, issues: Issue[]): Problem[] {
  return checkIntegrity(issues).filter((problem) => problem.id === id);
}
