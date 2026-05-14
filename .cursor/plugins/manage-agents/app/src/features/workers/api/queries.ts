import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchDiskStats, fetchWorktreeDiskSize, type DiskStats } from "@/lib/api/disk";
import { fetchWorkerDetails, listWorkers } from "@/lib/api/workers";
import type { WorkerDetails, WorkerInfo } from "@/lib/api/types";
import { diskKeys, workersKeys } from "./keys";

export function useWorkersQuery(): UseQueryResult<WorkerInfo[], Error> {
  return useQuery({
    queryKey: workersKeys.list(),
    queryFn: listWorkers,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}

export function useWorkerDetailsQuery(
  name: string | null,
): UseQueryResult<WorkerDetails, Error> {
  return useQuery({
    queryKey: name ? workersKeys.details(name) : workersKeys.details("__none__"),
    queryFn: () => fetchWorkerDetails(name as string),
    enabled: !!name,
    staleTime: 0,
  });
}

export function useDiskStatsQuery(): UseQueryResult<DiskStats, Error> {
  return useQuery({
    queryKey: diskKeys.stats(),
    queryFn: fetchDiskStats,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useWorktreeDiskSizeQuery(
  name: string | null,
): UseQueryResult<{ size: number }, Error> {
  return useQuery({
    queryKey: name ? diskKeys.size(name) : diskKeys.size("__none__"),
    queryFn: () => fetchWorktreeDiskSize(name as string),
    enabled: !!name,
    staleTime: 0,
  });
}
