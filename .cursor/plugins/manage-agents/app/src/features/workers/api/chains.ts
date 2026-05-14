import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelChain,
  fetchChainStatus,
  startChain,
  type ChainInfo,
} from "@/lib/api/chains";
import { messageOf } from "@/lib/utils/error-message";
import { workersKeys } from "./keys";

export function useChainStatusQuery(
  name: string | null,
): UseQueryResult<ChainInfo, Error> {
  return useQuery({
    queryKey: name ? workersKeys.chain(name) : workersKeys.chain("__none__"),
    queryFn: () => fetchChainStatus(name as string),
    enabled: !!name,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "launching" || s === "booting" ? 2_000 : false;
    },
    staleTime: 0,
  });
}

export function useStartChain() {
  const qc = useQueryClient();
  return useMutation<{ chainId: number; pid: number; port: number }, Error, string>({
    mutationFn: (name) => startChain(name),
    onSuccess: (_data, name) => {
      qc.invalidateQueries({ queryKey: workersKeys.chain(name) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useCancelChain() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (name) => cancelChain(name),
    onSuccess: (_data, name) => {
      qc.invalidateQueries({ queryKey: workersKeys.chain(name) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}
