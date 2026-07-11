import { describe, expect, it } from "vitest";
import { derive, EPIC_BASE } from "./derive";
import type { Issue } from "../schemas";

let clock = 0;
function nextAt(): string {
  clock += 1;
  return new Date(Date.UTC(2026, 6, 9, 14, 0, clock)).toISOString();
}

const epic = (id: string, partOf = "p", order = 0): Issue => ({
  id,
  kind: "epic",
  title: id,
  partOf,
  order,
  needsAttention: false,
  attentionReason: null,
  createdAt: nextAt(),
  updatedAt: nextAt(),
});

const branch = (
  id: string,
  partOf: string,
  extra: Partial<Extract<Issue, { kind: "branch" }>> = {},
  order = 0,
): Issue => ({
  id,
  kind: "branch",
  title: id,
  partOf,
  order,
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
  order = 0,
): Issue => ({
  id,
  kind: "commit",
  title: id,
  partOf,
  order,
  status: "todo",
  needsAttention: false,
  attentionReason: null,
  createdAt: nextAt(),
  updatedAt: nextAt(),
  ...extra,
});

const project = (id: string, order = 0): Issue => ({
  id,
  kind: "project",
  title: id,
  order,
  createdAt: nextAt(),
  updatedAt: nextAt(),
});

describe("derive - commit ready/blocked", () => {
  it("marks a todo commit ready when its branch has a name and earlier siblings are done", () => {
    const issues = [
      project("p"),
      epic("e"),
      branch("b", "e", { branchName: "feat/b" }),
      commit("c1", "b", { status: "done", commitSha: "aaa" }, 0),
      commit("c2", "b", {}, 1),
    ];
    const { byId } = derive(issues);
    expect(byId.c2.ready).toBe(true);
    expect(byId.c2.blocked).toBe(false);
  });

  it("blocks a todo commit when an earlier sibling is not done", () => {
    const issues = [
      project("p"),
      epic("e"),
      branch("b", "e", { branchName: "feat/b" }),
      commit("c1", "b", {}, 0),
      commit("c2", "b", {}, 1),
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
      project("p"),
      epic("e"),
      branch("started", "e", { branchName: "feat/started" }, 0),
      commit("c1", "started", {}, 0),
      branch("fresh", "e", {}, 1),
      branch("blocked", "e", { stackedOn: "fresh" }, 0),
    ];
    const { ready } = derive(issues);
    expect(ready).toContain("c1");
    expect(ready).toContain("fresh");
    expect(ready).not.toContain("started");
    expect(ready).not.toContain("blocked");
  });
});

describe("derive - ready set structural ordering", () => {
  it("orders ready branches within an epic by stored order, regardless of input order", () => {
    // Deliberately scrambled input; the ready set must follow `order`.
    const issues = [
      project("p"),
      epic("e"),
      branch("beta", "e", {}, 1),
      branch("alpha", "e", {}, 0),
    ];
    expect(derive(issues).ready).toEqual(["alpha", "beta"]);
  });

  it("emits a root branch's ready commit before the branch stacked on it (DFS)", () => {
    // root has a branchName so its commit is ready; child forks the root's tip
    // (base = root's branchName) so it is also ready-to-start. DFS must place the
    // root's own commit ahead of the stacked child.
    const issues = [
      project("p"),
      epic("e"),
      branch("root", "e", { branchName: "feat/root" }, 0),
      commit("root-c", "root", {}, 0),
      branch("child", "e", { stackedOn: "root" }, 0),
    ];
    expect(derive(issues).ready).toEqual(["root-c", "child"]);
  });

  it("orders ready items across epics by epic order, tolerating equal per-group order", () => {
    // Both branches carry order 0 — legitimate, since each is the sole root of a
    // different epic. A flat sort would tie; structural DFS orders by epic.
    const issues = [
      project("p"),
      epic("ea", "p", 0),
      epic("eb", "p", 1),
      branch("a", "ea", {}, 0),
      branch("b", "eb", {}, 0),
    ];
    const { ready, problems } = derive(issues);
    expect(problems).toEqual([]);
    expect(ready).toEqual(["a", "b"]);
  });

  it("orders ready items across projects by project order", () => {
    const issues = [
      project("p1", 0),
      project("p2", 1),
      epic("e1", "p1", 0),
      epic("e2", "p2", 0),
      branch("b1", "e1", {}, 0),
      branch("b2", "e2", {}, 0),
    ];
    expect(derive(issues).ready).toEqual(["b1", "b2"]);
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
