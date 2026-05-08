import { request } from "./client";

export interface DiskStats {
  total: number;
  used: number;
  free: number;
}

export function fetchDiskStats(): Promise<DiskStats> {
  return request<DiskStats>("/api/disk");
}

export function fetchWorktreeDiskSize(
  name: string,
): Promise<{ size: number }> {
  return request<{ size: number }>(
    `/api/disk/${encodeURIComponent(name)}/size`,
  );
}
