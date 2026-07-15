import { describe, expect, it } from "vitest";
import { parseChatMessage, parseChatMessageInput, parseIssue } from "./schemas";

const project = {
  id: "platform",
  kind: "project",
  title: "Platform",
  createdAt: "2026-07-09T14:00:00.000Z",
  updatedAt: "2026-07-09T14:00:00.000Z",
};

const epic = {
  id: "add-auth",
  kind: "epic",
  title: "Add authentication",
  partOf: "platform",
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
  it("parses a project with an optional workspace", () => {
    const result = parseIssue({ ...project, workspace: "/tmp/repo" });
    expect(result.ok).toBe(true);
    if (result.ok && result.issue.kind === "project") {
      expect(result.issue.workspace).toBe("/tmp/repo");
    }
  });

  it("defaults mergePolicy to manual for a project", () => {
    const result = parseIssue(project);
    expect(result.ok).toBe(true);
    if (result.ok && result.issue.kind === "project") {
      expect(result.issue.mergePolicy).toBe("manual");
    }
  });

  it("rejects an unknown mergePolicy", () => {
    expect(parseIssue({ ...project, mergePolicy: "rebase" }).ok).toBe(false);
  });

  it("parses a project (minimal fields only)", () => {
    const result = parseIssue(project);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issue.kind).toBe("project");
  });

  it("parses an epic and defaults blockedBy to []", () => {
    const result = parseIssue(epic);
    expect(result.ok).toBe(true);
    if (result.ok && result.issue.kind === "epic") {
      expect(result.issue.blockedBy).toEqual([]);
    }
  });

  it("rejects an epic missing its partOf project", () => {
    const { partOf: _partOf, ...rest } = epic;
    expect(parseIssue(rest).ok).toBe(false);
  });

  it("parses a branch with its stackedOn fork point and no blockedBy", () => {
    const result = parseIssue(branch);
    expect(result.ok).toBe(true);
    if (result.ok && result.issue.kind === "branch") {
      expect(result.issue.stackedOn).toBe("db-schema");
      expect("blockedBy" in result.issue).toBe(false);
    }
  });

  it("parses a branch with an optional specReview", () => {
    const passed = parseIssue({ ...branch, specReview: "passed" });
    expect(passed.ok).toBe(true);
    if (passed.ok && passed.issue.kind === "branch") {
      expect(passed.issue.specReview).toBe("passed");
    }

    const failed = parseIssue({ ...branch, specReview: "failed" });
    expect(failed.ok).toBe(true);
    if (failed.ok && failed.issue.kind === "branch") {
      expect(failed.issue.specReview).toBe("failed");
    }

    const absent = parseIssue(branch);
    expect(absent.ok).toBe(true);
    if (absent.ok && absent.issue.kind === "branch") {
      expect(absent.issue.specReview).toBeUndefined();
    }
  });

  it("rejects an unknown specReview value", () => {
    expect(parseIssue({ ...branch, specReview: "pending" }).ok).toBe(false);
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
    if (result.ok && result.issue.kind !== "project") {
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

describe("parseChatMessage", () => {
  const valid = { role: "agent", body: "hello", at: "2026-07-09T14:00:00.000Z" };

  it("parses a stored message with an optional name", () => {
    const result = parseChatMessage({ ...valid, name: "codex" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.name).toBe("codex");
  });

  it("rejects an empty body, a missing at, and a non-object", () => {
    expect(parseChatMessage({ ...valid, body: "" }).ok).toBe(false);
    const { at: _at, ...noAt } = valid;
    expect(parseChatMessage(noAt).ok).toBe(false);
    expect(parseChatMessage(null).ok).toBe(false);
  });
});

describe("parseChatMessageInput", () => {
  it("accepts role + body (+ optional name) and omits at", () => {
    const result = parseChatMessageInput({ role: "human", body: "hi" });
    expect(result.ok).toBe(true);
    if (result.ok) expect("at" in result.input).toBe(false);
  });

  it("rejects a missing role, an empty body, and a null/undefined body", () => {
    expect(parseChatMessageInput({ body: "hi" }).ok).toBe(false);
    expect(parseChatMessageInput({ role: "agent", body: "" }).ok).toBe(false);
    expect(parseChatMessageInput(null).ok).toBe(false);
    expect(parseChatMessageInput(undefined).ok).toBe(false);
  });
});
