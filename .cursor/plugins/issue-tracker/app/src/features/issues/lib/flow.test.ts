import { describe, expect, it } from "vitest";
import type { DerivedState, IssueRecord } from "@server/schemas";
import { flowBuckets } from "./flow";

const t0 = "2026-07-01T00:00:00.000Z";
const t1 = "2026-07-02T00:00:00.000Z";
const t2 = "2026-07-03T00:00:00.000Z";

function project(id: string): IssueRecord {
  return {
    id,
    kind: "project",
    title: id,
    order: 0,
    createdAt: t0,
    updatedAt: t0,
  };
}

function epic(
  id: string,
  partOf: string,
  updatedAt = t0,
): IssueRecord {
  return {
    id,
    kind: "epic",
    title: id,
    partOf,
    order: 0,
    createdAt: t0,
    updatedAt,
    needsAttention: false,
    attentionReason: null,
    blockedBy: [],
    archived: false,
  };
}

function story(
  id: string,
  partOf: string,
  updatedAt = t0,
): IssueRecord {
  return {
    id,
    kind: "story",
    title: id,
    partOf,
    order: 0,
    createdAt: t0,
    updatedAt,
    branchName: id,
    merged: false,
    needsAttention: false,
    attentionReason: null,
    archived: false,
  };
}

function task(id: string, partOf: string): IssueRecord {
  return {
    id,
    kind: "task",
    title: id,
    partOf,
    order: 0,
    createdAt: t0,
    updatedAt: t0,
    status: "todo",
    needsAttention: false,
    attentionReason: null,
  };
}

function idea(id: string, partOf: string): IssueRecord {
  return {
    id,
    kind: "idea",
    title: id,
    partOf,
    order: 0,
    createdAt: t0,
    updatedAt: t0,
    archived: false,
  };
}

function ids(items: { issue: IssueRecord }[]): string[] {
  return items.map((item) => item.issue.id);
}

describe("flowBuckets", () => {
  it("assigns each Story/Epic to exactly one bucket by precedence", () => {
    const issues = [
      project("p"),
      epic("blocked-epic", "p"),
      story("blocked-story", "blocked-epic"),
      epic("flight-epic", "p"),
      story("flight-story", "flight-epic"),
      story("pr-story", "flight-epic"),
      epic("done-epic", "p"),
      story("merged-story", "done-epic"),
      epic("ready-epic", "p"),
      story("ready-story", "ready-epic"),
    ];
    const derived: Record<string, DerivedState> = {
      "blocked-epic": { blocked: true, epicStatus: "in-progress" },
      "blocked-story": { blocked: true, storyStatus: "pr-open" },
      "flight-epic": { blocked: false, epicStatus: "in-progress" },
      "flight-story": { blocked: false, storyStatus: "in-progress" },
      "pr-story": { blocked: false, storyStatus: "pr-open" },
      "done-epic": { blocked: false, epicStatus: "done" },
      "merged-story": { blocked: false, storyStatus: "merged" },
      "ready-epic": { blocked: false, epicStatus: "todo" },
      "ready-story": { blocked: false, storyStatus: "not-started" },
    };

    const buckets = flowBuckets(issues, derived, { projectId: "p" });

    expect(ids(buckets.blocked).sort()).toEqual(
      ["blocked-epic", "blocked-story"].sort(),
    );
    expect(ids(buckets.inFlight).sort()).toEqual(
      ["flight-epic", "flight-story", "pr-story"].sort(),
    );
    expect(ids(buckets.recentlyMerged).sort()).toEqual(
      ["done-epic", "merged-story"].sort(),
    );
    expect(ids(buckets.ready).sort()).toEqual(
      ["ready-epic", "ready-story"].sort(),
    );
  });

  it("puts blocked ahead of inFlight and recentlyMerged", () => {
    const issues = [
      project("p"),
      epic("e", "p"),
      story("s-flight", "e"),
      story("s-merged", "e"),
    ];
    const derived: Record<string, DerivedState> = {
      e: { blocked: true, epicStatus: "done" },
      "s-flight": { blocked: true, storyStatus: "in-progress" },
      "s-merged": { blocked: true, storyStatus: "merged" },
    };

    const buckets = flowBuckets(issues, derived, {});

    expect(ids(buckets.blocked).sort()).toEqual(
      ["e", "s-flight", "s-merged"].sort(),
    );
    expect(buckets.inFlight).toEqual([]);
    expect(buckets.recentlyMerged).toEqual([]);
    expect(buckets.ready).toEqual([]);
  });

  it("orders recentlyMerged by updatedAt descending", () => {
    const issues = [
      project("p"),
      epic("old-epic", "p", t0),
      epic("mid-epic", "p", t1),
      story("new-story", "mid-epic", t2),
    ];
    const derived: Record<string, DerivedState> = {
      "old-epic": { blocked: false, epicStatus: "done" },
      "mid-epic": { blocked: false, epicStatus: "done" },
      "new-story": { blocked: false, storyStatus: "merged" },
    };

    const buckets = flowBuckets(issues, derived, { projectId: "p" });

    expect(ids(buckets.recentlyMerged)).toEqual([
      "new-story",
      "mid-epic",
      "old-epic",
    ]);
  });

  it("excludes Tasks, Projects, and Ideas", () => {
    const issues = [
      project("p"),
      idea("i", "p"),
      epic("e", "p"),
      story("s", "e"),
      task("t", "s"),
    ];
    const derived: Record<string, DerivedState> = {
      e: { blocked: false, epicStatus: "todo" },
      s: { blocked: false, storyStatus: "not-started" },
      t: { blocked: false },
    };

    const buckets = flowBuckets(issues, derived, { projectId: "p" });

    expect(ids(buckets.ready).sort()).toEqual(["e", "s"].sort());
    expect(buckets.inFlight).toEqual([]);
    expect(buckets.blocked).toEqual([]);
    expect(buckets.recentlyMerged).toEqual([]);
  });

  it("scopes to projectId when set and aggregates when omitted", () => {
    const issues = [
      project("p1"),
      project("p2"),
      epic("e1", "p1"),
      story("s1", "e1"),
      epic("e2", "p2"),
      story("s2", "e2"),
    ];
    const derived: Record<string, DerivedState> = {
      e1: { blocked: false, epicStatus: "todo" },
      s1: { blocked: false, storyStatus: "not-started" },
      e2: { blocked: false, epicStatus: "in-progress" },
      s2: { blocked: false, storyStatus: "pr-open" },
    };

    const scoped = flowBuckets(issues, derived, { projectId: "p1" });
    expect(ids(scoped.ready).sort()).toEqual(["e1", "s1"].sort());
    expect(scoped.inFlight).toEqual([]);

    const all = flowBuckets(issues, derived, {});
    expect(ids(all.ready).sort()).toEqual(["e1", "s1"].sort());
    expect(ids(all.inFlight).sort()).toEqual(["e2", "s2"].sort());
  });

  it("includes pr-open Stories in inFlight (broader than isInFlight)", () => {
    const issues = [project("p"), epic("e", "p"), story("s", "e")];
    const derived: Record<string, DerivedState> = {
      e: { blocked: false, epicStatus: "todo" },
      s: { blocked: false, storyStatus: "pr-open" },
    };

    const buckets = flowBuckets(issues, derived, { projectId: "p" });
    expect(ids(buckets.inFlight)).toEqual(["s"]);
    expect(ids(buckets.ready)).toEqual(["e"]);
  });
});
