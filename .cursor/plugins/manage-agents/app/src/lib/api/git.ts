import { request } from "./client";

export interface BranchCheckResult {
  localExists: boolean;
  remoteRef: string | null;
}

export function fetchOriginRefs(): Promise<void> {
  return request("/api/git/fetch", { method: "POST" });
}

export function checkBranch(name: string): Promise<BranchCheckResult> {
  return request(`/api/git/branch-check?name=${encodeURIComponent(name)}`);
}
