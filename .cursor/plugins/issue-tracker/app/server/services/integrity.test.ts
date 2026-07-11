import { describe, expect, it } from "vitest";
import { checkIntegrity, problemsFor } from "./integrity";
import type { Issue } from "../schemas";

const AT = "2026-07-09T14:00:00.000Z";

const project = (id: string): Issue => ({
  id,
  kind: "project",
  title: id,
  order: 0,
  createdAt: AT,
  updatedAt: AT,
});

const epic = (
  id: string,
  partOf = "root",
  extra: Partial<Extract<Issue, { kind: "epic" }>> = {},
): Issue => ({
  id,
  kind: "epic",
  title: id,
  partOf,
  order: 0,
  needsAttention: false,
  attentionReason: null,
  createdAt: AT,
  updatedAt: AT,
  ...extra,
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
  order: 0,
  blockedBy: [],
  merged: false,
  needsAttention: false,
  attentionReason: null,
  createdAt: AT,
  updatedAt: AT,
  ...extra,
});

const commit = (id: string, partOf: string, order = 0): Issue => ({
  id,
  kind: "commit",
  title: id,
  partOf,
  order,
  status: "todo",
  needsAttention: false,
  attentionReason: null,
  createdAt: AT,
  updatedAt: AT,
});

describe("checkIntegrity", () => {
  it("passes a well-formed tree", () => {
    const issues = [
      project("root"),
      epic("e1"),
      branch("b1", "e1"),
      branch("b2", "e1", { stackedOn: "b1", blockedBy: [] }),
      commit("c1", "b1"),
    ];
    expect(checkIntegrity(issues)).toEqual([]);
  });

  it("flags an epic whose partOf is not a project", () => {
    const problems = checkIntegrity([epic("e1", "b1"), branch("b1", "e1")]);
    expect(
      problems.some((p) => p.id === "e1" && p.message.includes("must be a project")),
    ).toBe(true);
  });

  it("flags a dangling partOf", () => {
    const problems = checkIntegrity([commit("c1", "ghost")]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ id: "c1" });
    expect(problems[0].message).toContain("unknown issue");
  });

  it("flags a commit whose partOf is not a branch", () => {
    const problems = checkIntegrity([project("root"), epic("e1"), commit("c1", "e1")]);
    expect(problems.some((p) => p.message.includes("must be a branch"))).toBe(true);
  });

  it("flags a branch whose partOf is not an epic", () => {
    const problems = checkIntegrity([branch("b1", "e1"), branch("b2", "b1")]);
    const relevant = problems.filter((p) => p.id === "b2");
    expect(relevant[0].message).toContain("must be a epic");
  });

  it("flags a dangling stackedOn", () => {
    const problems = checkIntegrity([
      epic("e1"),
      branch("b1", "e1", { stackedOn: "ghost" }),
    ]);
    expect(problems.some((p) => p.message.includes("stackedOn"))).toBe(true);
  });

  it("flags a stackedOn that is not a branch", () => {
    const problems = checkIntegrity([
      epic("e1"),
      branch("b1", "e1", { stackedOn: "e1" }),
    ]);
    expect(
      problems.some(
        (p) => p.message.includes("stackedOn") && p.message.includes("branch"),
      ),
    ).toBe(true);
  });

  it("flags a stackedOn in a different epic", () => {
    const problems = checkIntegrity([
      epic("e1"),
      epic("e2"),
      branch("b1", "e1"),
      branch("b2", "e2", { stackedOn: "b1" }),
    ]);
    expect(
      problems.some(
        (p) => p.id === "b2" && p.message.includes("same Epic"),
      ),
    ).toBe(true);
  });

  it("does not flag a same-epic stackedOn", () => {
    const problems = checkIntegrity([
      epic("e1"),
      branch("b1", "e1"),
      branch("b2", "e1", { stackedOn: "b1" }),
    ]);
    expect(problems.some((p) => p.message.includes("same Epic"))).toBe(false);
  });

  it("flags a dangling blockedBy referent", () => {
    const problems = checkIntegrity([
      epic("e1"),
      branch("b1", "e1", { blockedBy: ["ghost"] }),
    ]);
    expect(problems.some((p) => p.message.includes("blockedBy"))).toBe(true);
  });

  it("flags a blockedBy referent that is not a branch", () => {
    const problems = checkIntegrity([
      epic("e1"),
      commit("c1", "b1"),
      branch("b1", "e1", { blockedBy: ["c1"] }),
    ]);
    expect(
      problems.some(
        (p) => p.id === "b1" && p.message.includes("blockedBy"),
      ),
    ).toBe(true);
  });

  it("flags duplicate order within a sibling group", () => {
    const problems = checkIntegrity([
      project("root"),
      epic("e1"),
      epic("e2", "root", { order: 0 }),
    ]);
    expect(
      problems.some((p) => p.id === "e2" && p.message.includes("duplicate order")),
    ).toBe(true);
  });
});

describe("checkIntegrity - cycles", () => {
  it("flags a branch stacked on itself", () => {
    const problems = checkIntegrity([
      epic("e1"),
      branch("b1", "e1", { stackedOn: "b1" }),
    ]);
    expect(problems.some((p) => p.id === "b1" && /cycle/i.test(p.message))).toBe(
      true,
    );
  });

  it("flags a two-branch stackedOn cycle on both members", () => {
    const problems = checkIntegrity([
      epic("e1"),
      branch("a", "e1", { stackedOn: "b" }),
      branch("b", "e1", { stackedOn: "a" }),
    ]);
    const cycleIds = problems
      .filter((p) => /cycle/i.test(p.message))
      .map((p) => p.id)
      .sort();
    expect(cycleIds).toEqual(["a", "b"]);
  });

  it("flags a mixed stackedOn/blockedBy cycle", () => {
    const problems = checkIntegrity([
      epic("e1"),
      branch("a", "e1", { stackedOn: "b" }),
      branch("b", "e1", { blockedBy: ["c"] }),
      branch("c", "e1", { stackedOn: "a" }),
    ]);
    const cycleIds = problems
      .filter((p) => /cycle/i.test(p.message))
      .map((p) => p.id)
      .sort();
    expect(cycleIds).toEqual(["a", "b", "c"]);
  });

  it("does not flag a well-formed dependency chain", () => {
    const problems = checkIntegrity([
      epic("e1"),
      branch("a", "e1"),
      branch("b", "e1", { stackedOn: "a" }),
      branch("c", "e1", { stackedOn: "b", blockedBy: ["a"] }),
    ]);
    expect(problems.filter((p) => /cycle/i.test(p.message))).toEqual([]);
  });
});

describe("problemsFor", () => {
  it("returns only problems attributed to the given id", () => {
    const issues = [commit("c1", "ghost"), commit("c2", "ghost2")];
    const only = problemsFor("c1", issues);
    expect(only).toHaveLength(1);
    expect(only[0].id).toBe("c1");
  });
});

describe("validate-at-write (problemsFor against a prospective state)", () => {
  it("rejects a write that would close a stackedOn cycle", () => {
    const prospective = [
      epic("e1"),
      branch("a", "e1", { stackedOn: "b" }),
      branch("b", "e1", { stackedOn: "a" }),
    ];
    expect(problemsFor("b", prospective).length).toBeGreaterThan(0);
  });

  it("rejects a write with a dangling blockedBy", () => {
    const prospective = [
      epic("e1"),
      branch("b", "e1", { blockedBy: ["ghost"] }),
    ];
    expect(problemsFor("b", prospective)[0].message).toContain("unknown issue");
  });

  it("rejects a write with a kind violation", () => {
    const prospective = [epic("e1"), commit("c", "e1")];
    expect(problemsFor("c", prospective)[0].message).toContain("must be a branch");
  });

  it("accepts a valid write", () => {
    const prospective = [
      epic("e1"),
      branch("a", "e1"),
      branch("b", "e1", { stackedOn: "a" }),
    ];
    expect(problemsFor("b", prospective)).toEqual([]);
  });
});
