import { describe, expect, it } from "vitest";
import { mergeIssue } from "./merge";
import type { Issue } from "../schemas";

type CommitIssue = Extract<Issue, { kind: "commit" }>;
const asCommit = (issue: Issue): CommitIssue => issue as CommitIssue;

const commit: Issue = {
  id: "login-route",
  kind: "commit",
  title: "Add login route",
  partOf: "auth-endpoints",
  status: "todo",
  needsAttention: false,
  attentionReason: null,
  createdAt: "2026-07-09T14:36:00.000Z",
  updatedAt: "2026-07-09T14:36:00.000Z",
};

describe("mergeIssue", () => {
  it("changes only the named field and preserves the rest", () => {
    const merged = mergeIssue(commit, { status: "done" });
    expect(merged.kind === "commit" && merged.status).toBe("done");
    expect(merged.title).toBe(commit.title);
    expect(merged.kind === "commit" && merged.partOf).toBe(commit.partOf);
    expect(merged.createdAt).toBe(commit.createdAt);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(commit);
    mergeIssue(commit, { status: "done", commitSha: "abc123" });
    expect(JSON.stringify(commit)).toBe(before);
  });

  it("ignores undefined patch fields (no blind overwrite)", () => {
    const merged = mergeIssue(commit, { status: undefined });
    expect(merged.kind === "commit" && merged.status).toBe("todo");
  });

  it("applies null attentionReason explicitly", () => {
    const flagged = asCommit(
      mergeIssue(commit, {
        needsAttention: true,
        attentionReason: "stuck",
      }),
    );
    expect(flagged.needsAttention).toBe(true);
    expect(flagged.attentionReason).toBe("stuck");
    const cleared = asCommit(mergeIssue(flagged, { attentionReason: null }));
    expect(cleared.attentionReason).toBeNull();
    expect(cleared.needsAttention).toBe(true);
  });

  it("merges multiple fields at once", () => {
    const merged = asCommit(
      mergeIssue(commit, {
        status: "done",
        commitSha: "deadbeef",
        assignee: "codex",
      }),
    );
    expect(merged.status).toBe("done");
    expect(merged.commitSha).toBe("deadbeef");
    expect(merged.assignee).toBe("codex");
  });

  it("does not touch updatedAt (the service owns timestamps)", () => {
    const merged = mergeIssue(commit, { status: "done" });
    expect(merged.updatedAt).toBe(commit.updatedAt);
  });

  it("clears a clearable optional field when patched with null", () => {
    const assigned = asCommit(
      mergeIssue(commit, { assignee: "codex", commitSha: "abc" }),
    );
    expect(assigned.assignee).toBe("codex");
    const cleared = mergeIssue(assigned, { assignee: null, commitSha: null });
    expect("assignee" in cleared).toBe(false);
    expect(cleared.kind === "commit" && "commitSha" in cleared).toBe(false);
  });

  it("keeps a null attentionReason as an explicit value, not a deletion", () => {
    const merged = asCommit(mergeIssue(commit, { attentionReason: null }));
    expect("attentionReason" in merged).toBe(true);
    expect(merged.attentionReason).toBeNull();
  });
});
