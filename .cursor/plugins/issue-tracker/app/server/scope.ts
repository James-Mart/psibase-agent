import type { IssueRecord } from "./schemas.js";

// Resolve a `--project` value that may be either a project id or a project
// title into a canonical project id. An exact id match wins; otherwise we fall
// back to a unique title match. Zero or multiple title matches are an error so
// callers never silently scope to the wrong project.
export function resolveProjectId(issues: IssueRecord[], value: string): string {
  const byId = issues.find(
    (issue) => issue.id === value && issue.kind === "project",
  );
  if (byId) return byId.id;
  const byTitle = issues.filter(
    (issue) => issue.kind === "project" && issue.title === value,
  );
  if (byTitle.length === 1) return byTitle[0].id;
  if (byTitle.length === 0) throw new Error(`unknown project "${value}"`);
  throw new Error(
    `ambiguous project title "${value}" matches ${byTitle.length} projects`,
  );
}
