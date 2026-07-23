import type { DerivedState, IssueRecord } from "@server/schemas";
import type { BoardKindFilter } from "./board-kind-filter";
import { issuesById, projectIdOf } from "./build-tree";
import { filterWithAncestors } from "./filter-with-ancestors";
import { issueMatchesLabelFilter } from "./project-labels";
import type { RailNodeState } from "./rail-state";
import { issueMatchesSearch } from "./search";

export type { RailNodeState };

export type FlowItem = {
  issue: IssueRecord;
  state: DerivedState | undefined;
};

export type DepGraphNode = {
  id: string;
  label: string;
  state: RailNodeState;
};

export type DepGraphEdge = {
  from: string;
  to: string;
  satisfied: boolean;
};

export type DepGraphModel = {
  nodes: DepGraphNode[];
  edges: DepGraphEdge[];
};

export type FlowBuckets = {
  ready: FlowItem[];
  inFlight: FlowItem[];
  blocked: FlowItem[];
  recentlyMerged: FlowItem[];
};

export type FlowScope = {
  projectId?: string;
};

/** In-memory Flow lens filters (search / label / kind). Archive is applied separately. */
export type FlowFilters = {
  search: string;
  labelIds: readonly string[];
  kind: BoardKindFilter;
};

export function flowFiltersActive(filters: FlowFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.labelIds.length > 0 ||
    filters.kind !== "both"
  );
}

function flowKindAllows(
  kind: IssueRecord["kind"],
  filter: BoardKindFilter,
): boolean {
  if (filter === "both") return kind === "epic" || kind === "story";
  return kind === filter;
}

/**
 * Story/Epic ids kept under Flow filters. Mirrors the old tree pipeline:
 * sequential `filterWithAncestors` per active search/label dimension (so an
 * Epic matching labels while a child matches search still survives), then
 * kind via `flowKindAllows`.
 */
export function matchingFlowIssueIds(
  issues: IssueRecord[],
  filters: FlowFilters,
): Set<string> {
  let next = issues;
  if (filters.search.trim()) {
    next = filterWithAncestors(next, (issue) =>
      issueMatchesSearch(issue, filters.search),
    );
  }
  if (filters.labelIds.length > 0) {
    const labelIds = [...filters.labelIds];
    next = filterWithAncestors(next, (issue) =>
      issueMatchesLabelFilter(issue, labelIds),
    );
  }
  const keep = new Set<string>();
  for (const issue of next) {
    if (
      (issue.kind === "story" || issue.kind === "epic") &&
      flowKindAllows(issue.kind, filters.kind)
    ) {
      keep.add(issue.id);
    }
  }
  return keep;
}

/** Narrow bucketed Flow rows by search / label / kind. Pure — no I/O. */
export function filterFlowBuckets(
  buckets: FlowBuckets,
  issues: IssueRecord[],
  filters: FlowFilters,
): FlowBuckets {
  if (!flowFiltersActive(filters)) return buckets;
  const keep = matchingFlowIssueIds(issues, filters);
  const take = (items: FlowItem[]) =>
    items.filter((item) => keep.has(item.issue.id));
  return {
    ready: take(buckets.ready),
    inFlight: take(buckets.inFlight),
    blocked: take(buckets.blocked),
    recentlyMerged: take(buckets.recentlyMerged),
  };
}

function isStoryOrEpic(
  issue: IssueRecord,
): issue is IssueRecord & { kind: "story" | "epic" } {
  return issue.kind === "story" || issue.kind === "epic";
}

function isInFlightBucket(
  issue: IssueRecord & { kind: "story" | "epic" },
  state: DerivedState | undefined,
): boolean {
  if (issue.kind === "story") {
    return (
      state?.storyStatus === "in-progress" || state?.storyStatus === "pr-open"
    );
  }
  return state?.epicStatus === "in-progress";
}

function isRecentlyMerged(
  issue: IssueRecord & { kind: "story" | "epic" },
  state: DerivedState | undefined,
): boolean {
  if (issue.kind === "story") return state?.storyStatus === "merged";
  return state?.epicStatus === "done";
}

/**
 * Bucket Stories and Epics into ready / inFlight / blocked / recentlyMerged.
 * Pure view-model — no I/O. `inFlight` is broader than the `isInFlight`
 * liveness helper: it includes `pr-open` Stories.
 */
export function flowBuckets(
  issues: IssueRecord[],
  derived: Record<string, DerivedState>,
  scope: FlowScope = {},
): FlowBuckets {
  const byId = issuesById(issues);
  const candidates = issues.filter((issue) => {
    if (!isStoryOrEpic(issue)) return false;
    if (scope.projectId === undefined) return true;
    return projectIdOf(issue.id, byId) === scope.projectId;
  }) as Array<IssueRecord & { kind: "story" | "epic" }>;

  const ready: FlowItem[] = [];
  const inFlight: FlowItem[] = [];
  const blocked: FlowItem[] = [];
  const recentlyMerged: FlowItem[] = [];

  for (const issue of candidates) {
    const state = derived[issue.id];
    const item: FlowItem = { issue, state };
    if (state?.blocked) {
      blocked.push(item);
    } else if (isInFlightBucket(issue, state)) {
      inFlight.push(item);
    } else if (isRecentlyMerged(issue, state)) {
      recentlyMerged.push(item);
    } else {
      ready.push(item);
    }
  }

  recentlyMerged.sort((a, b) =>
    b.issue.updatedAt.localeCompare(a.issue.updatedAt),
  );

  return { ready, inFlight, blocked, recentlyMerged };
}

function depGraphNodeState(derived: DerivedState | undefined): RailNodeState {
  if (derived?.blocked) return "blocked";
  if (derived?.epicStatus === "done") return "merged";
  if (derived?.epicStatus === "in-progress") return "in-flight";
  return "ready";
}

/**
 * Build a node-link DAG model of Epics and their `blockedBy` edges.
 * Edge direction is prerequisite → dependent. Pure view-model — no I/O.
 */
export function depGraphModel(
  epics: IssueRecord[],
  derived: Record<string, DerivedState>,
): DepGraphModel {
  const epicRecords = epics.filter(
    (issue): issue is IssueRecord & { kind: "epic" } => issue.kind === "epic",
  );

  const nodes: DepGraphNode[] = epicRecords.map((issue) => ({
    id: issue.id,
    label: issue.title,
    state: depGraphNodeState(derived[issue.id]),
  }));

  const edgeKeys = new Set<string>();
  const edges: DepGraphEdge[] = [];
  for (const issue of epicRecords) {
    for (const from of issue.blockedBy) {
      const key = `${from}\0${issue.id}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        from,
        to: issue.id,
        satisfied: derived[from]?.epicStatus === "done",
      });
    }
  }

  return { nodes, edges };
}
