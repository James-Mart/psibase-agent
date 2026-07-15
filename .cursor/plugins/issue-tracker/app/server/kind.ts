import type { IssueKind } from "./schemas.js";

export const KIND_LABEL: Record<IssueKind, string> = {
  project: "Project",
  epic: "Epic",
  branch: "Branch",
  commit: "Commit",
};
