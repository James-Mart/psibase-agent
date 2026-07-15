import type { IssueDetail } from "@server/schemas";

export function blockedByFormValue(issue: IssueDetail): string {
  return issue.kind === "epic" ? issue.blockedBy.join(" ") : "";
}

export function parseIds(text: string): string[] {
  const seen = new Set<string>();
  for (const token of text.split(/[\s,]+/)) {
    if (token) seen.add(token);
  }
  return [...seen];
}
