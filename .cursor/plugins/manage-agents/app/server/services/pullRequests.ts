import { execFileSync } from "child_process";
import { REPO_ROOT } from "../config.js";
import type { PrInfo, PrState, ReviewDecision } from "../types.js";

interface RawPr {
  headRefName?: string;
  state: string;
  url: string;
  reviewDecision?: string;
  number?: number;
}

const STATE_PRIORITY: Record<string, number> = {
  OPEN: 0,
  MERGED: 1,
  CLOSED: 2,
};

export function normalizePrState(raw: string): PrState {
  const upper = raw.toUpperCase();
  if (upper === "MERGED") return "merged";
  if (upper === "CLOSED") return "closed";
  return "open";
}

function normalizeReviewDecision(raw: string | undefined): ReviewDecision | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === "APPROVED") return "approved";
  if (upper === "CHANGES_REQUESTED") return "changes_requested";
  if (upper === "REVIEW_REQUIRED") return "review_required";
  return null;
}

let cachedRepo: { owner: string; name: string } | null = null;

function getRepoIdentity(): { owner: string; name: string } | null {
  if (cachedRepo) return cachedRepo;
  try {
    const json = execFileSync(
      "gh",
      ["repo", "view", "--json", "owner,name"],
      { encoding: "utf-8", timeout: 10_000, cwd: REPO_ROOT },
    );
    const parsed = JSON.parse(json) as { owner: { login: string }; name: string };
    cachedRepo = { owner: parsed.owner.login, name: parsed.name };
    return cachedRepo;
  } catch {
    return null;
  }
}

interface ThreadNode {
  isResolved: boolean;
}
interface GqlPrThreads {
  reviewThreads: { nodes: ThreadNode[] };
}

function fetchThreadCounts(prNumbers: number[]): Map<number, number> {
  const result = new Map<number, number>();
  if (prNumbers.length === 0) return result;

  const repo = getRepoIdentity();
  if (!repo) return result;

  const fragments = prNumbers
    .map((n) => `pr_${n}: pullRequest(number: ${n}) { reviewThreads(first: 100) { nodes { isResolved } } }`)
    .join("\n    ");

  const query = `query { repository(owner: "${repo.owner}", name: "${repo.name}") {\n    ${fragments}\n  } }`;

  try {
    const json = execFileSync(
      "gh",
      ["api", "graphql", "-f", `query=${query}`],
      { encoding: "utf-8", timeout: 15_000, cwd: REPO_ROOT },
    );
    const parsed = JSON.parse(json) as { data: { repository: Record<string, GqlPrThreads> } };
    const repo_data = parsed.data?.repository;
    if (!repo_data) return result;

    for (const num of prNumbers) {
      const pr = repo_data[`pr_${num}`];
      if (!pr) continue;
      const unresolved = pr.reviewThreads.nodes.filter((t) => !t.isResolved).length;
      result.set(num, unresolved);
    }
  } catch {
    return result;
  }
  return result;
}

function loadAllPrs(): Map<string, PrInfo> {
  const map = new Map<string, PrInfo>();
  let json: string;
  try {
    json = execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "all",
        "--json",
        "headRefName,state,url,reviewDecision,number",
        "--limit",
        "200",
      ],
      { encoding: "utf-8", timeout: 15_000, cwd: REPO_ROOT },
    );
  } catch {
    return map;
  }

  let prs: RawPr[];
  try {
    prs = JSON.parse(json) as RawPr[];
  } catch {
    return map;
  }

  const numberByBranch = new Map<string, number>();

  for (const pr of prs) {
    if (!pr.headRefName) continue;
    const existing = map.get(pr.headRefName);
    if (
      existing &&
      STATE_PRIORITY[existing.state.toUpperCase()] <= STATE_PRIORITY[pr.state.toUpperCase()]
    ) {
      continue;
    }
    map.set(pr.headRefName, {
      state: normalizePrState(pr.state),
      url: pr.url,
      reviewDecision: normalizeReviewDecision(pr.reviewDecision),
      unresolvedThreads: 0,
    });
    if (pr.number) numberByBranch.set(pr.headRefName, pr.number);
  }

  const prNumbers = [...numberByBranch.values()];
  const threadCounts = fetchThreadCounts(prNumbers);

  for (const [branch, num] of numberByBranch) {
    const info = map.get(branch);
    if (info && threadCounts.has(num)) {
      info.unresolvedThreads = threadCounts.get(num)!;
    }
  }

  return map;
}

let prCache: Map<string, PrInfo> = new Map();
let lastRefreshAt = 0;
let inFlight: Promise<void> | null = null;

const PR_CACHE_TTL_MS = 30_000;

function refreshPrCacheAsync(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = new Promise<void>((resolve) => {
    setImmediate(() => {
      try {
        prCache = loadAllPrs();
        lastRefreshAt = Date.now();
      } catch {}
      inFlight = null;
      resolve();
    });
  });
  return inFlight;
}

export function fetchAllPrs(): Map<string, PrInfo> {
  if (Date.now() - lastRefreshAt > PR_CACHE_TTL_MS) {
    void refreshPrCacheAsync();
  }
  return prCache;
}

export function primePrCache(): Promise<void> {
  return refreshPrCacheAsync();
}

export function fetchPrForBranch(branch: string): PrInfo | null {
  if (!branch || branch === "HEAD") return null;
  return fetchAllPrs().get(branch) ?? null;
}
