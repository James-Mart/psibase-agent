import { describe, expect, it } from "vitest";
import { derive, EPIC_BASE } from "./derive";
import type { Issue } from "../schemas";

let clock = 0;
function nextAt(): string {
  clock += 1;
  return new Date(Date.UTC(2026, 6, 9, 14, 0, clock)).toISOString();
}

const epic = (id: string): Issue => ({
  id,
  kind: "epic",
  title: id,
  needsAttention: false,
  attentionReason: null,
  createdAt: nextAt(),
  updatedAt: nextAt(),
});

const branch = (
  id: string,
  partOf: string,
  extra: Partial<Extract<Issue, { kind: "branch" }>> = {},
): Issue => ({
  id,
  kind: "branch",
  title: id,
  partOf,
  blockedBy: [],
  merged: false,
  needsAttention: false,
  attentionReason: null,
  createdAt: nextAt(),
  updatedAt: nextAt(),
  ...extra,
});

const commit = (
  id: string,
  partOf: string,
  extra: Partial<Extract<Issue, { kind: "commit" }>> = {},
): Issue => ({
  id,
  kind: "commit",
  title: id,
  partOf,
  status: "todo",
  needsAttention: false,
  attentionReason: null,
  createdAt: nextAt(),
  updatedAt: nextAt(),
  ...extra,
});

describe("derive - commit ready/blocked", () => {
  it("marks a todo commit ready when its branch has a name and earlier siblings are done", () => {
    const issues = [
      epic("e"),
      branch("b", "e", { branchName: "feat/b" }),
      commit("c1", "b", { status: "done", commitSha: "aaa" }),
      commit("c2", "b"),
    ];
    const { byId } = derive(issues);
    expect(byId.c2.ready).toBe(true);
    expect(byId.c2.blocked).toBe(false);
  });

  it("blocks a todo commit when an earlier sibling is not done", () => {
    const issues = [
      epic("e"),
      branch("b", "e", { branchName: "feat/b" }),
      commit("c1", "b"),
      commit("c2", "b"),
    ];
    const { byId } = derive(issues);
    expect(byId.c1.ready).toBe(true);
    expect(byId.c2.ready).toBe(false);
    expect(byId.c2.blocked).toBe(true);
  });

  it("blocks a todo commit when its branch has no branchName", () => {
    const issues = [epic("e"), branch("b", "e"), commit("c1", "b")];
    const { byId } = derive(issues);
    expect(byId.c1.ready).toBe(false);
    expect(byId.c1.blocked).toBe(true);
  });

  it("treats in-progress and done commits as neither ready nor blocked", () => {
    const issues = [
      epic("e"),
      branch("b", "e", { branchName: "feat/b" }),
      commit("c1", "b", { status: "in-progress" }),
      commit("c2", "b", { status: "done", commitSha: "z" }),
    ];
    const { byId } = derive(issues);
    expect(byId.c1.ready).toBe(false);
    expect(byId.c1.blocked).toBe(false);
    expect(byId.c2.ready).toBe(false);
    expect(byId.c2.blocked).toBe(false);
  });

  it("does not mark a commit ready when its branch is merged", () => {
    const issues = [
      epic("e"),
      branch("b", "e", { branchName: "feat/b", merged: true }),
      commit("c1", "b"),
    ];
    const { byId, ready } = derive(issues);
    expect(byId.c1.ready).toBe(false);
    expect(ready).not.toContain("c1");
  });
});

describe("derive - branch base resolution", () => {
  it("uses the stackedOn branch's branchName as base", () => {
    const issues = [
      epic("e"),
      branch("base", "e", { branchName: "feat/base" }),
      branch("b", "e", { stackedOn: "base" }),
    ];
    const { byId } = derive(issues);
    expect(byId.b.base).toBe("feat/base");
  });

  it("falls back to the epic base (main) with no stackedOn", () => {
    const issues = [epic("e"), branch("b", "e")];
    expect(derive(issues).byId.b.base).toBe(EPIC_BASE);
  });

  it("falls back to main when the stackedOn branch has no branchName", () => {
    const issues = [
      epic("e"),
      branch("base", "e"),
      branch("b", "e", { stackedOn: "base" }),
    ];
    expect(derive(issues).byId.b.base).toBe(EPIC_BASE);
  });
});

describe("derive - branch status", () => {
  it("is merged when merged", () => {
    const issues = [epic("e"), branch("b", "e", { merged: true, branchName: "x" })];
    expect(derive(issues).byId.b.branchStatus).toBe("merged");
  });

  it("is pr-open when all child commits are done and a prUrl is set", () => {
    const issues = [
      epic("e"),
      branch("b", "e", { branchName: "feat/b", prUrl: "http://pr/1" }),
      commit("c1", "b", { status: "done", commitSha: "a" }),
      commit("c2", "b", { status: "done", commitSha: "b" }),
    ];
    expect(derive(issues).byId.b.branchStatus).toBe("pr-open");
  });

  it("is in-progress when a branchName exists but not all commits are done", () => {
    const issues = [
      epic("e"),
      branch("b", "e", { branchName: "feat/b", prUrl: "http://pr/1" }),
      commit("c1", "b", { status: "done", commitSha: "a" }),
      commit("c2", "b"),
    ];
    expect(derive(issues).byId.b.branchStatus).toBe("in-progress");
  });

  it("is not-started when there is no branchName", () => {
    const issues = [epic("e"), branch("b", "e")];
    expect(derive(issues).byId.b.branchStatus).toBe("not-started");
  });

  it("is not pr-open when the branch has a prUrl but zero commits", () => {
    const issues = [
      epic("e"),
      branch("b", "e", { branchName: "feat/b", prUrl: "http://pr/1" }),
    ];
    expect(derive(issues).byId.b.branchStatus).toBe("in-progress");
  });
});

describe("derive - branch ready to start", () => {
  it("is ready when it has no stackedOn and no blockers", () => {
    const issues = [epic("e"), branch("b", "e")];
    const d = derive(issues).byId.b;
    expect(d.ready).toBe(true);
    expect(d.blocked).toBe(false);
  });

  it("is blocked when its stackedOn base does not exist yet", () => {
    const issues = [
      epic("e"),
      branch("base", "e"),
      branch("b", "e", { stackedOn: "base" }),
    ];
    const d = derive(issues).byId.b;
    expect(d.ready).toBe(false);
    expect(d.blocked).toBe(true);
  });

  it("is blocked when a blockedBy branch is not merged", () => {
    const issues = [
      epic("e"),
      branch("dep", "e", { branchName: "feat/dep" }),
      branch("b", "e", { blockedBy: ["dep"] }),
    ];
    expect(derive(issues).byId.b.ready).toBe(false);
  });

  it("is ready when its base exists and every blocker is merged", () => {
    const issues = [
      epic("e"),
      branch("base", "e", { branchName: "feat/base" }),
      branch("dep", "e", { branchName: "feat/dep", merged: true }),
      branch("b", "e", { stackedOn: "base", blockedBy: ["dep"] }),
    ];
    expect(derive(issues).byId.b.ready).toBe(true);
  });
});

describe("derive - epic rollup", () => {
  it("is done when every descendant branch is merged", () => {
    const issues = [
      epic("e"),
      branch("b1", "e", { merged: true, branchName: "x" }),
      branch("b2", "e", { merged: true, branchName: "y" }),
    ];
    expect(derive(issues).byId.e.epicStatus).toBe("done");
  });

  it("is in-progress when a branch has started", () => {
    const issues = [
      epic("e"),
      branch("b1", "e", { branchName: "x" }),
      branch("b2", "e"),
    ];
    expect(derive(issues).byId.e.epicStatus).toBe("in-progress");
  });

  it("is todo when no branch has started", () => {
    const issues = [epic("e"), branch("b1", "e"), branch("b2", "e")];
    expect(derive(issues).byId.e.epicStatus).toBe("todo");
  });

  it("is todo for an empty epic", () => {
    expect(derive([epic("e")]).byId.e.epicStatus).toBe("todo");
  });
});

describe("derive - ready set", () => {
  it("lists ready commits and startable (not-started, ready) branches only", () => {
    const issues = [
      epic("e"),
      branch("started", "e", { branchName: "feat/started" }),
      commit("c1", "started"),
      branch("fresh", "e"),
      branch("blocked", "e", { stackedOn: "fresh" }),
    ];
    const { ready } = derive(issues);
    expect(ready).toContain("c1");
    expect(ready).toContain("fresh");
    expect(ready).not.toContain("started");
    expect(ready).not.toContain("blocked");
  });
});

describe("derive - problems", () => {
  it("passes integrity problems through (cycles, dangling, kind)", () => {
    const issues = [
      epic("e"),
      branch("a", "e", { stackedOn: "b" }),
      branch("b", "e", { stackedOn: "a" }),
      commit("c", "e"),
    ];
    const problems = derive(issues).problems;
    expect(problems.filter((p) => /cycle/i.test(p.message)).map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(problems.some((p) => p.id === "c" && /must be a branch/.test(p.message))).toBe(true);
  });
});
