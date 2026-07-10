import { describe, expect, it } from "vitest";
import { stackedBranchOrder } from "./order";
import type { Issue } from "./schemas";

let clock = 0;
function nextAt(): string {
  clock += 1;
  return new Date(Date.UTC(2026, 6, 10, 14, 0, clock)).toISOString();
}

type Branch = Extract<Issue, { kind: "branch" }>;

// Build a branch with an explicit `createdAt` so tie-break order is deterministic
// regardless of construction order.
const branch = (
  id: string,
  createdAt: string,
  extra: Partial<Branch> = {},
): Branch => ({
  id,
  kind: "branch",
  title: id,
  partOf: "e",
  blockedBy: [],
  merged: false,
  needsAttention: false,
  attentionReason: null,
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

const ids = (branches: Branch[]): string[] => branches.map((b) => b.id);

describe("stackedBranchOrder", () => {
  it("emits each root immediately followed by what is stacked on it (depth-first)", () => {
    const a = branch("a", nextAt());
    const b = branch("b", nextAt(), { stackedOn: "a" });
    const c = branch("c", nextAt(), { stackedOn: "b" });
    expect(ids(stackedBranchOrder([c, a, b]))).toEqual(["a", "b", "c"]);
  });

  it("tie-breaks sibling roots and sibling children by bySequence (createdAt asc)", () => {
    const early = branch("early", nextAt());
    const late = branch("late", nextAt());
    const childEarly = branch("child-early", nextAt(), { stackedOn: "early" });
    const childLate = branch("child-late", nextAt(), { stackedOn: "early" });
    // Pass in a deliberately scrambled order; ordering must come from createdAt.
    expect(ids(stackedBranchOrder([late, childLate, childEarly, early]))).toEqual([
      "early",
      "child-early",
      "child-late",
      "late",
    ]);
  });

  it("treats a stackedOn pointing outside the set as a root", () => {
    const b = branch("b", nextAt(), { stackedOn: "not-in-set" });
    expect(ids(stackedBranchOrder([b]))).toEqual(["b"]);
  });

  it("terminates on a pure stackedOn cycle (both are children, so no root anchors traversal)", () => {
    // a<->b point at each other, so neither is a root and the DFS starts
    // nowhere: the function returns empty rather than looping. Integrity reports
    // the cycle as a problem; ordering just refuses to invent an order for it.
    const a = branch("a", nextAt(), { stackedOn: "b" });
    const b = branch("b", nextAt(), { stackedOn: "a" });
    expect(stackedBranchOrder([a, b])).toEqual([]);
  });

  it("returns an empty array for no branches", () => {
    expect(stackedBranchOrder([])).toEqual([]);
  });
});
