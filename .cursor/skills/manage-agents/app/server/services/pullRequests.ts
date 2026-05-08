import { execFileSync } from "child_process";
import { REPO_ROOT } from "../config.js";
import type { PrInfo, PrState } from "../types.js";

interface RawPr {
  headRefName?: string;
  state: string;
  url: string;
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

export function fetchAllPrs(): Map<string, PrInfo> {
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
        "headRefName,state,url",
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

  for (const pr of prs) {
    if (!pr.headRefName) continue;
    const existing = map.get(pr.headRefName);
    if (
      existing &&
      STATE_PRIORITY[existing.state.toUpperCase()] <= STATE_PRIORITY[pr.state.toUpperCase()]
    ) {
      continue;
    }
    map.set(pr.headRefName, { state: normalizePrState(pr.state), url: pr.url });
  }
  return map;
}

export function fetchPrForBranch(branch: string, cwd: string): PrInfo | null {
  if (!branch || branch === "HEAD") return null;
  let json: string;
  try {
    json = execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--head",
        branch,
        "--state",
        "all",
        "--json",
        "state,url",
        "--limit",
        "1",
      ],
      { encoding: "utf-8", timeout: 10_000, cwd },
    );
  } catch {
    return null;
  }

  let prs: RawPr[];
  try {
    prs = JSON.parse(json) as RawPr[];
  } catch {
    return null;
  }
  if (prs.length === 0) return null;
  return { state: normalizePrState(prs[0].state), url: prs[0].url };
}
