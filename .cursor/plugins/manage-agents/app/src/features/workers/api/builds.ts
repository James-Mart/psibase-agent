import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelBuild,
  fetchAllBuilds,
  fetchBuildStatus,
  startBuild,
  type BuildInfo,
  type BuildSummary,
} from "@/lib/api/builds";
import { messageOf } from "@/lib/utils/error-message";
import { workersKeys } from "./keys";

export function useBuildStatusQuery(
  name: string | null,
): UseQueryResult<BuildInfo, Error> {
  return useQuery({
    queryKey: name ? workersKeys.build(name) : workersKeys.build("__none__"),
    queryFn: () => fetchBuildStatus(name as string),
    enabled: !!name,
    refetchInterval: (q) =>
      q.state.data?.status === "running" ? 2_000 : false,
    staleTime: 0,
  });
}

export function useAllBuildsQuery(): UseQueryResult<BuildSummary[], Error> {
  return useQuery({
    queryKey: workersKeys.allBuilds(),
    queryFn: fetchAllBuilds,
    refetchInterval: 2_000,
    staleTime: 0,
  });
}

function ensureNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export function useStartBuild() {
  const qc = useQueryClient();
  return useMutation<{ buildId: number; pid: number }, Error, string>({
    mutationFn: (name) => {
      ensureNotificationPermission();
      return startBuild(name);
    },
    onSuccess: (_data, name) => {
      qc.invalidateQueries({ queryKey: workersKeys.build(name) });
      qc.invalidateQueries({ queryKey: workersKeys.allBuilds() });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useCancelBuild() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (name) => cancelBuild(name),
    onSuccess: (_data, name) => {
      qc.invalidateQueries({ queryKey: workersKeys.build(name) });
      qc.invalidateQueries({ queryKey: workersKeys.allBuilds() });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}
