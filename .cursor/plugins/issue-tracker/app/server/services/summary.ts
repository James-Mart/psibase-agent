import type { Issue, IssueKind } from "../schemas.js";
import { KIND_LABEL } from "../kind.js";
import { attachmentPath, listAttachments } from "./attachments.js";
import { IssueError } from "./errors.js";
import { readAll, readDescription } from "./issues.js";
import { ancestorChain } from "./subtree.js";

/** Name + size as rendered by show/summary; not full Attachment metadata. */
export interface SummaryAttachment {
  name: string;
  size: number;
}

export interface SummaryNode {
  kind: IssueKind;
  id: string;
  title: string;
  /** First prose paragraph of description.md (heading stripped); empty if none. */
  descriptionSummary: string;
  /** Set when a Commit intentionally landed no file changes. */
  noDiff?: true;
  /** Present when the issue has one or more attachments. */
  attachments?: SummaryAttachment[];
}

export interface IssueSummary {
  /** Ancestor chain from Project down to the requested issue. */
  nodes: SummaryNode[];
  workspace?: string;
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
 * Agent-oriented lines listing attachment names, sizes, and on-disk paths.
 * `indent` prefixes every line (e.g. `"  "` under a summary node).
 */
export function formatAttachmentsSection(
  id: string,
  attachments: SummaryAttachment[],
  indent = "",
): string[] {
  if (attachments.length === 0) return [];
  return [
    `${indent}Attachments:`,
    ...attachments.map(
      (att) =>
        `${indent}  ${att.name} (${att.size} bytes) — ${attachmentPath(id, att.name)}`,
    ),
  ];
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
  attachmentsOf: (
    id: string,
    kind: IssueKind,
  ) => SummaryAttachment[] | undefined = () => undefined,
): IssueSummary {
  const chain = ancestorChain(id, issues);
  const root = chain[0];
  return {
    ...(root?.kind === "project" && root.workspace
      ? { workspace: root.workspace }
      : {}),
    nodes: chain.map((issue) => {
      const attachments = attachmentsOf(issue.id, issue.kind);
      return {
        kind: issue.kind,
        id: issue.id,
        title: issue.title,
        descriptionSummary: summarizeDescription(descriptionOf(issue.id)),
        ...(issue.kind === "commit" && issue.noDiff
          ? { noDiff: true as const }
          : {}),
        ...(attachments ? { attachments } : {}),
      };
    }),
  };
}

function loadAttachments(
  id: string,
  kind: IssueKind,
): SummaryAttachment[] | undefined {
  if (kind === "project") return undefined;
  const listed = listAttachments(id);
  if (listed.length === 0) return undefined;
  return listed.map(({ name, size }) => ({ name, size }));
}

/** Load the on-disk graph and build a summary for `id`. */
export function summarize(id: string): IssueSummary {
  const { issues } = readAll();
  return buildSummary(id, issues, readDescription, loadAttachments);
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
    if (node.kind === "project" && summary.workspace) {
      lines.push(`  Workspace: ${summary.workspace}`);
    }
    if (node.descriptionSummary) {
      lines.push(`  Description: ${node.descriptionSummary}`);
    }
    if (node.kind === "commit" && node.noDiff) {
      lines.push(`  noDiff: true`);
    }
    if (node.attachments) {
      lines.push(...formatAttachmentsSection(node.id, node.attachments, "  "));
    }
  }
  lines.push("");
  lines.push(
    "For more details, try `issue show <id>` or `issue tree`.",
  );
  return lines.join("\n");
}
