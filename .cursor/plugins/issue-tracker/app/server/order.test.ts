import { describe, expect, it } from "vitest";
import { epicDependencyIds, epicsBlockedBy, stackedBranchOrder } from "./order";
import type { Issue } from "./schemas";

type Branch = Extract<Issue, { kind: "branch" }>;
type Epic = Extract<Issue, { kind: "epic" }>;

const branch = (
  id: string,
  order: number,
  extra: Partial<Branch> = {},
): Branch => ({
  id,
  kind: "branch",
  title: id,
  partOf: "e",
  order,
  merged: false,
  needsAttention: false,
  attentionReason: null,
  createdAt: "2026-07-10T14:00:00.000Z",
  updatedAt: "2026-07-10T14:00:00.000Z",
  ...extra,
});

const epic = (
  id: string,
  blockedBy: string[] = [],
  extra: Partial<Epic> = {},
): Epic => ({
  id,
  kind: "epic",
  title: id,
  partOf: "p",
  order: 0,
  blockedBy,
  needsAttention: false,
  attentionReason: null,
  createdAt: "2026-07-10T14:00:00.000Z",
  updatedAt: "2026-07-10T14:00:00.000Z",
  ...extra,
});

const ids = (branches: Branch[]): string[] => branches.map((b) => b.id);

describe("stackedBranchOrder", () => {
  it("emits each root immediately followed by what is stacked on it (depth-first)", () => {
    const a = branch("a", 0);
    const b = branch("b", 0, { stackedOn: "a" });
    const c = branch("c", 0, { stackedOn: "b" });
    expect(ids(stackedBranchOrder([c, a, b]))).toEqual(["a", "b", "c"]);
  });

  it("orders sibling roots and sibling children by stored order", () => {
    const early = branch("early", 0);
    const late = branch("late", 1);
    const childEarly = branch("child-early", 0, { stackedOn: "early" });
    const childLate = branch("child-late", 1, { stackedOn: "early" });
    expect(ids(stackedBranchOrder([late, childLate, childEarly, early]))).toEqual([
      "early",
      "child-early",
      "child-late",
      "late",
    ]);
  });

  it("treats a stackedOn pointing outside the set as a root", () => {
    const b = branch("b", 0, { stackedOn: "not-in-set" });
    expect(ids(stackedBranchOrder([b]))).toEqual(["b"]);
  });

  it("terminates on a pure stackedOn cycle (both are children, so no root anchors traversal)", () => {
    const a = branch("a", 0, { stackedOn: "b" });
    const b = branch("b", 0, { stackedOn: "a" });
    expect(stackedBranchOrder([a, b])).toEqual([]);
  });

  it("returns an empty array for no branches", () => {
    expect(stackedBranchOrder([])).toEqual([]);
  });
});

describe("epic dependency edges", () => {
  it("epicDependencyIds returns an epic's blockedBy ids", () => {
    expect(epicDependencyIds(epic("t", ["a", "b"]))).toEqual(["a", "b"]);
    expect(epicDependencyIds(epic("t"))).toEqual([]);
  });

  it("epicsBlockedBy returns the epics that list a blocker, ignoring non-epics", () => {
    const a = epic("a");
    const t = epic("t", ["a"]);
    const u = epic("u", ["a", "b"]);
    const unrelated = epic("v", ["b"]);
    const notAnEpic = branch("br", 0);
    const blocked = epicsBlockedBy("a", [a, t, u, unrelated, notAnEpic]);
    expect(blocked.map((e) => e.id).sort()).toEqual(["t", "u"]);
  });
});
