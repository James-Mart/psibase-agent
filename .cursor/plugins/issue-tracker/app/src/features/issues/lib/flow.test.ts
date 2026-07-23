import { describe, expect, it } from "vitest";
import type { DerivedState, IssueRecord } from "@server/schemas";
import {
  depGraphModel,
  filterFlowBuckets,
  flowBuckets,
  flowFiltersActive,
  type FlowBuckets,
  type FlowFilters,
} from "./flow";

const noFilters: FlowFilters = { search: "", labelIds: [], kind: "both" };

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
  blockedBy: string[] = [],
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
    blockedBy,
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

function labeledStory(
  id: string,
  partOf: string,
  labels: string[],
): IssueRecord {
  return { ...story(id, partOf), labels };
}

function labeledEpic(
  id: string,
  partOf: string,
  labels: string[],
): IssueRecord {
  return { ...epic(id, partOf), labels };
}

function ids(items: { issue: IssueRecord }[]): string[] {
  return items.map((item) => item.issue.id);
}

function bucketIds(buckets: FlowBuckets): Record<keyof FlowBuckets, string[]> {
  return {
    ready: ids(buckets.ready),
    inFlight: ids(buckets.inFlight),
    blocked: ids(buckets.blocked),
    recentlyMerged: ids(buckets.recentlyMerged),
  };
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

describe("filterFlowBuckets", () => {
  const issues = [
    project("p"),
    epic("ready-epic", "p"),
    labeledStory("ready-story", "ready-epic", ["bug"]),
    task("ready-task", "ready-story"),
    epic("flight-epic", "p"),
    story("flight-story", "flight-epic"),
  ];
  const derived: Record<string, DerivedState> = {
    "ready-epic": { blocked: false, epicStatus: "todo" },
    "ready-story": { blocked: false, storyStatus: "not-started" },
    "flight-epic": { blocked: false, epicStatus: "in-progress" },
    "flight-story": { blocked: false, storyStatus: "in-progress" },
  };
  const buckets = flowBuckets(issues, derived, { projectId: "p" });

  it("flowFiltersActive is false for defaults", () => {
    expect(flowFiltersActive(noFilters)).toBe(false);
    expect(flowFiltersActive({ ...noFilters, search: "  " })).toBe(false);
  });

  it("returns buckets unchanged when filters are inactive", () => {
    expect(filterFlowBuckets(buckets, issues, noFilters)).toEqual(buckets);
  });

  it("filters by kind", () => {
    const epicsOnly = filterFlowBuckets(buckets, issues, {
      ...noFilters,
      kind: "epic",
    });
    expect(bucketIds(epicsOnly)).toEqual({
      ready: ["ready-epic"],
      inFlight: ["flight-epic"],
      blocked: [],
      recentlyMerged: [],
    });

    const ideasOnly = filterFlowBuckets(buckets, issues, {
      ...noFilters,
      kind: "idea",
    });
    expect(bucketIds(ideasOnly)).toEqual({
      ready: [],
      inFlight: [],
      blocked: [],
      recentlyMerged: [],
    });
  });

  it("filters by search on the row or a descendant", () => {
    const byTitle = filterFlowBuckets(buckets, issues, {
      ...noFilters,
      search: "flight-story",
    });
    expect(ids(byTitle.inFlight).sort()).toEqual(
      ["flight-epic", "flight-story"].sort(),
    );
    expect(byTitle.ready).toEqual([]);

    const byTask = filterFlowBuckets(buckets, issues, {
      ...noFilters,
      search: "ready-task",
    });
    expect(ids(byTask.ready).sort()).toEqual(
      ["ready-epic", "ready-story"].sort(),
    );
  });

  it("filters by label OR and composes with kind", () => {
    const labeled = filterFlowBuckets(buckets, issues, {
      ...noFilters,
      labelIds: ["bug"],
    });
    expect(ids(labeled.ready).sort()).toEqual(
      ["ready-epic", "ready-story"].sort(),
    );
    expect(labeled.inFlight).toEqual([]);

    const storiesWithBug = filterFlowBuckets(buckets, issues, {
      search: "",
      labelIds: ["bug"],
      kind: "story",
    });
    expect(ids(storiesWithBug.ready)).toEqual(["ready-story"]);
  });

  it("keeps an Epic when labels match it and search matches a child (tree semantics)", () => {
    // AND-at-seed would drop both: epic matches label only, story matches search only.
    const crossIssues = [
      project("p"),
      labeledEpic("labeled-epic", "p", ["bug"]),
      story("search-story", "labeled-epic"),
    ];
    const crossDerived: Record<string, DerivedState> = {
      "labeled-epic": { blocked: false, epicStatus: "todo" },
      "search-story": { blocked: false, storyStatus: "not-started" },
    };
    const crossBuckets = flowBuckets(crossIssues, crossDerived, {
      projectId: "p",
    });
    const filtered = filterFlowBuckets(crossBuckets, crossIssues, {
      search: "search-story",
      labelIds: ["bug"],
      kind: "both",
    });
    expect(ids(filtered.ready)).toEqual(["labeled-epic"]);
    expect(filtered.inFlight).toEqual([]);
  });
});

describe("depGraphModel", () => {
  it("maps diamond DAG node states, prerequisite→dependent edges, and satisfied flags", () => {
    // C blocks A and B; A and B block D (diamond).
    const epics = [
      epic("C", "p"),
      epic("A", "p", t0, ["C"]),
      epic("B", "p", t0, ["C"]),
      epic("D", "p", t0, ["A", "B"]),
    ];
    const derived: Record<string, DerivedState> = {
      C: { blocked: false, epicStatus: "done" },
      A: { blocked: false, epicStatus: "in-progress" },
      B: { blocked: true, epicStatus: "todo" },
      D: { blocked: true, epicStatus: "todo" },
    };

    const model = depGraphModel(epics, derived);

    expect(model.nodes).toEqual([
      { id: "C", label: "C", state: "merged" },
      { id: "A", label: "A", state: "in-flight" },
      { id: "B", label: "B", state: "blocked" },
      { id: "D", label: "D", state: "blocked" },
    ]);

    expect(model.edges).toEqual([
      { from: "C", to: "A", satisfied: true },
      { from: "C", to: "B", satisfied: true },
      { from: "A", to: "D", satisfied: false },
      { from: "B", to: "D", satisfied: false },
    ]);
  });

  it("dedupes duplicate blockedBy entries and prefers blocked over epicStatus", () => {
    const epics = [
      epic("A", "p"),
      epic("B", "p", t0, ["A", "A"]),
      epic("ready", "p"),
    ];
    const derived: Record<string, DerivedState> = {
      A: { blocked: false, epicStatus: "done" },
      B: { blocked: true, epicStatus: "done" },
      ready: { blocked: false, epicStatus: "todo" },
    };

    const model = depGraphModel(epics, derived);

    expect(model.nodes.find((n) => n.id === "B")?.state).toBe("blocked");
    expect(model.nodes.find((n) => n.id === "ready")?.state).toBe("ready");
    expect(model.edges).toEqual([{ from: "A", to: "B", satisfied: true }]);
  });

  it("ignores non-epic records in the input list", () => {
    const issues = [
      project("p"),
      epic("E", "p"),
      story("S", "E"),
      task("T", "S"),
    ];
    const derived: Record<string, DerivedState> = {
      E: { blocked: false, epicStatus: "todo" },
    };

    const model = depGraphModel(issues, derived);
    expect(model.nodes).toEqual([{ id: "E", label: "E", state: "ready" }]);
    expect(model.edges).toEqual([]);
  });
});
