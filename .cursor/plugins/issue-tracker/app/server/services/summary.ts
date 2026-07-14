import type { Issue, IssueKind } from "../schemas.js";
import { KIND_LABEL } from "../kind.js";
import { IssueError } from "./errors.js";
import { readAll, readDescription } from "./issues.js";
import { ancestorChain } from "./subtree.js";

export interface SummaryNode {
  kind: IssueKind;
  id: string;
  title: string;
  /** First prose paragraph of description.md (heading stripped); empty if none. */
  descriptionSummary: string;
}

export interface IssueSummary {
  /** Ancestor chain from Project down to the requested issue. */
  nodes: SummaryNode[];
}

/** First non-empty paragraph after any leading `#` headings. */
export function summarizeDescription(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || /^#+\s/.test(trimmed)) {
      i += 1;
      continue;
    }
    break;
  }
  const para: string[] = [];
  while (i < lines.length && lines[i].trim() !== "") {
    para.push(lines[i].trim());
    i += 1;
  }
  return para.join(" ");
}

/**
 * Pure builder: walk `partOf` from `id` and attach description summaries.
 * Accepts any kind; a Branch/Epic/Project stops at that node rather than
 * inventing descendants.
 */
export function buildSummary(
  id: string,
  issues: Issue[],
  descriptionOf: (id: string) => string = () => "",
): IssueSummary {
  return {
    nodes: ancestorChain(id, issues).map((issue) => ({
      kind: issue.kind,
      id: issue.id,
      title: issue.title,
      descriptionSummary: summarizeDescription(descriptionOf(issue.id)),
    })),
  };
}

/** Load the on-disk graph and build a summary for `id`. */
export function summarize(id: string): IssueSummary {
  const { issues } = readAll();
  return buildSummary(id, issues, readDescription);
}

/** Agent-oriented plain-text rendering of {@link IssueSummary}. */
export function formatSummary(summary: IssueSummary): string {
  const project = summary.nodes[0];
  if (!project || project.kind !== "project") {
    throw new IssueError("validation", "summary chain missing project root");
  }
  const lines: string[] = [
    `This is an issue in the ${project.title} Project. Here are the details:`,
    "",
  ];
  for (const node of summary.nodes) {
    lines.push(`${KIND_LABEL[node.kind]}: ${node.id} — ${node.title}`);
    if (node.descriptionSummary) {
      lines.push(`  Description: ${node.descriptionSummary}`);
    }
  }
  lines.push("");
  lines.push("For more details on each of these, try `issue show <id>`.");
  return lines.join("\n");
}
