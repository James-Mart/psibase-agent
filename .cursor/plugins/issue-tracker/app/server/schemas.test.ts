import { describe, expect, it } from "vitest";
import { parseIssue } from "./schemas";

const epic = {
  id: "add-auth",
  kind: "epic",
  title: "Add authentication",
  createdAt: "2026-07-09T14:00:00.000Z",
  updatedAt: "2026-07-09T14:00:00.000Z",
};

const branch = {
  id: "auth-endpoints",
  kind: "branch",
  title: "Auth endpoints",
  partOf: "add-auth",
  branchName: "feat/auth",
  stackedOn: "db-schema",
  merged: false,
  createdAt: "2026-07-09T14:35:00.000Z",
  updatedAt: "2026-07-09T15:00:00.000Z",
};

const commit = {
  id: "login-route",
  kind: "commit",
  title: "Add login route",
  partOf: "auth-endpoints",
  status: "in-progress",
  createdAt: "2026-07-09T14:36:00.000Z",
  updatedAt: "2026-07-09T14:50:00.000Z",
};

describe("parseIssue - valid per kind", () => {
  it("parses an epic", () => {
    const result = parseIssue(epic);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issue.kind).toBe("epic");
  });

  it("parses a branch and defaults blockedBy", () => {
    const result = parseIssue(branch);
    expect(result.ok).toBe(true);
    if (result.ok && result.issue.kind === "branch") {
      expect(result.issue.stackedOn).toBe("db-schema");
      expect(result.issue.blockedBy).toEqual([]);
    }
  });

  it("parses a commit with a stored status", () => {
    const result = parseIssue(commit);
    expect(result.ok).toBe(true);
    if (result.ok && result.issue.kind === "commit") {
      expect(result.issue.status).toBe("in-progress");
    }
  });

  it("defaults needsAttention/attentionReason", () => {
    const result = parseIssue(epic);
    if (result.ok) {
      expect(result.issue.needsAttention).toBe(false);
      expect(result.issue.attentionReason).toBeNull();
    }
  });
});

describe("parseIssue - malformed is rejected with a message", () => {
  it("rejects an unknown kind", () => {
    const result = parseIssue({ ...epic, kind: "milestone" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  it("rejects a missing title", () => {
    const { title: _title, ...rest } = epic;
    const result = parseIssue(rest);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(parseIssue({ ...epic, title: "" }).ok).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(parseIssue(null).ok).toBe(false);
    expect(parseIssue("nope").ok).toBe(false);
  });

  it("rejects a wrong-typed field", () => {
    expect(parseIssue({ ...commit, status: 3 }).ok).toBe(false);
  });
});
