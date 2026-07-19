import type { Issue, IssueKind } from "./schemas.js";

export const KIND_LABEL: Record<IssueKind, string> = {
  project: "Project",
  epic: "Epic",
  idea: "Idea",
  story: "Story",
  task: "Task",
};

/** Per-kind field/affordance flags. Prefer these over ad-hoc `in` / kind checks. */
export const KIND_CAPABILITIES = {
  project: {
    partOf: false,
    archived: false,
    assignee: false,
    attention: false,
    attachments: false,
  },
  idea: {
    partOf: true,
    archived: true,
    assignee: false,
    attention: false,
    attachments: true,
  },
  epic: {
    partOf: true,
    archived: true,
    assignee: true,
    attention: true,
    attachments: true,
  },
  story: {
    partOf: true,
    archived: true,
    assignee: true,
    attention: true,
    attachments: true,
  },
  task: {
    partOf: true,
    archived: true,
    assignee: true,
    attention: true,
    attachments: true,
  },
} as const satisfies Record<
  IssueKind,
  {
    partOf: boolean;
    archived: boolean;
    assignee: boolean;
    attention: boolean;
    attachments: boolean;
  }
>;

export type AttentionIssue = Extract<
  Issue,
  { kind: "epic" | "story" | "task" }
>;
export type ArchivableIssue = Extract<
  Issue,
  { kind: "epic" | "idea" | "story" | "task" }
>;
export type AssigneeIssue = AttentionIssue;

export function kindHas(
  kind: IssueKind,
  capability: keyof (typeof KIND_CAPABILITIES)[IssueKind],
): boolean {
  return KIND_CAPABILITIES[kind][capability];
}

export function hasAttention(issue: Issue): issue is AttentionIssue {
  return KIND_CAPABILITIES[issue.kind].attention;
}

export function hasAssignee(issue: Issue): issue is AssigneeIssue {
  return KIND_CAPABILITIES[issue.kind].assignee;
}

export function hasArchived(issue: Issue): issue is ArchivableIssue {
  return KIND_CAPABILITIES[issue.kind].archived;
}

export function hasPartOf(
  issue: Issue,
): issue is Extract<Issue, { partOf: string }> {
  return KIND_CAPABILITIES[issue.kind].partOf;
}
