import { describe, expect, it } from "vitest";
import type { IssueDetail } from "@server/schemas";
import { blockedByFormValue } from "./issue-detail-form";

const branch: IssueDetail = {
  id: "auth-endpoints",
  kind: "branch",
  title: "Auth endpoints",
  partOf: "add-auth",
  branchName: "feat/auth",
  merged: false,
  assignee: undefined,
  needsAttention: false,
  attentionReason: null,
  order: 0,
  createdAt: "2026-07-09T14:35:00.000Z",
  updatedAt: "2026-07-09T15:00:00.000Z",
  hasDescription: false,
  hasChat: false,
  description: "",
  version: "v1",
};

const epic: IssueDetail = {
  id: "add-auth",
  kind: "epic",
  title: "Add authentication",
  partOf: "platform",
  blockedBy: ["billing", "identity"],
  assignee: undefined,
  needsAttention: false,
  attentionReason: null,
  order: 0,
  createdAt: "2026-07-09T14:00:00.000Z",
  updatedAt: "2026-07-09T14:00:00.000Z",
  hasDescription: false,
  hasChat: false,
  description: "",
  version: "v1",
};

describe("blockedByFormValue", () => {
  it("returns empty for a branch (no blockedBy field)", () => {
    expect(blockedByFormValue(branch)).toBe("");
  });

  it("joins an epic's blockedBy ids", () => {
    expect(blockedByFormValue(epic)).toBe("billing identity");
  });
});
