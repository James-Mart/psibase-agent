import type { IssueKind } from "@server/schemas";

export const KIND_LABEL: Record<IssueKind, string> = {
  project: "Project",
  epic: "Epic",
  branch: "Branch",
  commit: "Commit",
};
