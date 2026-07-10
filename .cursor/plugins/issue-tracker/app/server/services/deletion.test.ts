import { describe, expect, it } from "vitest";
import { planDeletion } from "./deletion";
import type { Issue } from "../schemas";

const AT = "2026-07-09T14:00:00.000Z";

const epic = (id: string): Issue => ({
  id,
  kind: "epic",
  title: id,
  needsAttention: false,
  attentionReason: null,
  createdAt: AT,
  updatedAt: AT,
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
  createdAt: AT,
  updatedAt: AT,
  ...extra,
});

const commit = (id: string, partOf: string): Issue => ({
  id,
  kind: "commit",
  title: id,
  partOf,
  status: "todo",
  needsAttention: false,
  attentionReason: null,
  createdAt: AT,
  updatedAt: AT,
});

describe("planDeletion - containment cascade", () => {
  it("deletes only the commit itself", () => {
    const plan = planDeletion(
      [epic("e"), branch("b", "e"), commit("c", "b")],
      "c",
    );
    expect(plan.deleteIds).toEqual(["c"]);
    expect(plan.repoint).toEqual([]);
    expect(plan.unblock).toEqual([]);
  });

  it("deletes a branch and its commits", () => {
    const plan = planDeletion(
      [epic("e"), branch("b", "e"), commit("c1", "b"), commit("c2", "b")],
      "b",
    );
    expect([...plan.deleteIds].sort()).toEqual(["b", "c1", "c2"]);
  });

  it("deletes an epic, its branches, and their commits transitively", () => {
    const plan = planDeletion(
      [
        epic("e"),
        branch("b1", "e"),
        branch("b2", "e", { stackedOn: "b1" }),
        commit("c1", "b1"),
        commit("c2", "b2"),
      ],
      "e",
    );
    expect([...plan.deleteIds].sort()).toEqual(["b1", "b2", "c1", "c2", "e"]);
    expect(plan.repoint).toEqual([]);
  });

  it("returns an empty plan for an unknown id", () => {
    expect(planDeletion([epic("e")], "ghost")).toEqual({
      deleteIds: [],
      repoint: [],
      unblock: [],
    });
  });
});

describe("planDeletion - stackedOn splice", () => {
  it("splices a mid-stack branch to its grandparent fork point", () => {
    const plan = planDeletion(
      [
        epic("e"),
        branch("a", "e"),
        branch("b", "e", { stackedOn: "a" }),
        branch("c", "e", { stackedOn: "b" }),
      ],
      "b",
    );
    expect(plan.deleteIds).toEqual(["b"]);
    expect(plan.repoint).toEqual([{ id: "c", to: "a" }]);
  });

  it("splices to main (undefined) when the deleted branch forked main", () => {
    const plan = planDeletion(
      [epic("e"), branch("a", "e"), branch("b", "e", { stackedOn: "a" })],
      "a",
    );
    expect(plan.repoint).toEqual([{ id: "b", to: undefined }]);
  });
});

describe("planDeletion - blockedBy drop", () => {
  it("drops the deleted branch from a dependent's blockedBy", () => {
    const plan = planDeletion(
      [
        epic("e"),
        branch("a", "e"),
        branch("b", "e"),
        branch("d", "e", { blockedBy: ["a", "b"] }),
      ],
      "a",
    );
    expect(plan.unblock).toEqual([{ id: "d", blockedBy: ["b"] }]);
  });

  it("drops a cross-Epic blockedBy when its Epic is deleted", () => {
    const plan = planDeletion(
      [
        epic("e1"),
        branch("a", "e1"),
        epic("e2"),
        branch("x", "e2", { blockedBy: ["a"] }),
      ],
      "e1",
    );
    expect([...plan.deleteIds].sort()).toEqual(["a", "e1"]);
    expect(plan.unblock).toEqual([{ id: "x", blockedBy: [] }]);
  });

  it("both splices and unblocks when a branch has each edge", () => {
    const plan = planDeletion(
      [
        epic("e"),
        branch("a", "e"),
        branch("b", "e", { stackedOn: "a" }),
        branch("c", "e", { stackedOn: "b" }),
        branch("d", "e", { blockedBy: ["b"] }),
      ],
      "b",
    );
    expect(plan.repoint).toEqual([{ id: "c", to: "a" }]);
    expect(plan.unblock).toEqual([{ id: "d", blockedBy: [] }]);
  });
});
