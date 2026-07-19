import { describe, expect, it } from "vitest";
import {
  epicDependencyIds,
  epicsBlockedBy,
  nextSiblingOrder,
  siblingGroupKey,
  stackedStoryOrder,
  stackedOnSubtree,
} from "./order";
import type { Issue } from "./schemas";

type Story = Extract<Issue, { kind: "story" }>;
type Epic = Extract<Issue, { kind: "epic" }>;

const branch = (
  id: string,
  order: number,
  extra: Partial<Story> = {},
): Story => ({
  id,
  kind: "story",
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

const ids = (branches: Story[]): string[] => branches.map((b) => b.id);

describe("stackedStoryOrder", () => {
  it("emits each root immediately followed by what is stacked on it (depth-first)", () => {
    const a = branch("a", 0);
    const b = branch("b", 0, { stackedOn: "a" });
    const c = branch("c", 0, { stackedOn: "b" });
    expect(ids(stackedStoryOrder([c, a, b]))).toEqual(["a", "b", "c"]);
  });

  it("orders sibling roots and sibling children by stored order", () => {
    const early = branch("early", 0);
    const late = branch("late", 1);
    const childEarly = branch("child-early", 0, { stackedOn: "early" });
    const childLate = branch("child-late", 1, { stackedOn: "early" });
    expect(ids(stackedStoryOrder([late, childLate, childEarly, early]))).toEqual([
      "early",
      "child-early",
      "child-late",
      "late",
    ]);
  });

  it("treats a stackedOn pointing outside the set as a root", () => {
    const b = branch("b", 0, { stackedOn: "not-in-set" });
    expect(ids(stackedStoryOrder([b]))).toEqual(["b"]);
  });

  it("terminates on a pure stackedOn cycle (both are children, so no root anchors traversal)", () => {
    const a = branch("a", 0, { stackedOn: "b" });
    const b = branch("b", 0, { stackedOn: "a" });
    expect(stackedStoryOrder([a, b])).toEqual([]);
  });

  it("returns an empty array for no branches", () => {
    expect(stackedStoryOrder([])).toEqual([]);
  });
});

describe("stackedOnSubtree", () => {
  it("returns the root and transitive stackedOn descendants in stackedStoryOrder", () => {
    const a = branch("a", 0);
    const b = branch("b", 0, { stackedOn: "a" });
    const c = branch("c", 0, { stackedOn: "b" });
    const d = branch("d", 1, { stackedOn: "a" });
    const z = branch("z", 2);
    const all = [z, d, c, b, a];
    expect(ids(stackedOnSubtree(all, "a"))).toEqual(["a", "b", "c", "d"]);
    expect(ids(stackedOnSubtree(all, "b"))).toEqual(["b", "c"]);
    expect(ids(stackedOnSubtree(all, "z"))).toEqual(["z"]);
  });

  it("returns empty when the root id is missing", () => {
    expect(stackedOnSubtree([branch("a", 0)], "ghost")).toEqual([]);
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

describe("epic + idea shared sibling group", () => {
  const ideaIssue = (
    id: string,
    order: number,
    partOf = "p",
  ): Extract<Issue, { kind: "idea" }> => ({
    id,
    kind: "idea",
    title: id,
    partOf,
    order,
    archived: false,
    createdAt: "2026-07-10T14:00:00.000Z",
    updatedAt: "2026-07-10T14:00:00.000Z",
  });

  it("puts epic and idea under the same project-keyed group", () => {
    const e = epic("e");
    const i = ideaIssue("i", 1);
    expect(siblingGroupKey(e)).toBe(siblingGroupKey(i));
    expect(siblingGroupKey(e)).toBe("project:p");
  });

  it("appends nextSiblingOrder across epic and idea in the same project", () => {
    const e = epic("e");
    const i = ideaIssue("i", 1);
    expect(nextSiblingOrder([e, i], "idea", "p", undefined)).toBe(2);
    expect(nextSiblingOrder([e, i], "epic", "p", undefined)).toBe(2);
  });
});
