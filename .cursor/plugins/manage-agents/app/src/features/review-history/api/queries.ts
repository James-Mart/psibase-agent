import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchActiveChain,
  fetchApiKeyStatus,
  fetchAvailableModels,
  fetchChangedFiles,
  fetchEdge,
  fetchInProgressRefinement,
  fetchNodeDiff,
  fetchNodeGraph,
  fetchSessionForWorker,
  fetchValidateHead,
} from "@/lib/api/review-history";
import type {
  AvailableModel,
  EdgeRefinement,
  EdgeRefinementDetail,
  NodeDiff,
  NodeGraph,
  RhsSessionEnvelope,
  ValidationResult,
  VirtualNode,
} from "../types";
import { rhsKeys } from "./keys";

export function useApiKeyStatusQuery(): UseQueryResult<{ ok: boolean }, Error> {
  return useQuery({
    queryKey: rhsKeys.apiKeyStatus(),
    queryFn: fetchApiKeyStatus,
    staleTime: 60_000,
  });
}

export function useAvailableModelsQuery(
  enabled = true,
): UseQueryResult<{ items: AvailableModel[] }, Error> {
  return useQuery({
    queryKey: rhsKeys.models(),
    queryFn: fetchAvailableModels,
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useRhsSessionForWorkerQuery(
  workerName: string | null,
): UseQueryResult<RhsSessionEnvelope, Error> {
  return useQuery({
    queryKey: workerName
      ? rhsKeys.sessionForWorker(workerName)
      : rhsKeys.sessionForWorker("__none__"),
    queryFn: () => fetchSessionForWorker(workerName as string),
    enabled: !!workerName,
    refetchInterval: (q) => {
      const status = q.state.data?.session?.prepStatus;
      return status === "preparing" ? 1500 : false;
    },
    staleTime: 0,
  });
}

export function useNodeGraphQuery(
  sessionId: string | null,
): UseQueryResult<NodeGraph, Error> {
  return useQuery({
    queryKey: sessionId ? rhsKeys.graph(sessionId) : rhsKeys.graph("__none__"),
    queryFn: () => fetchNodeGraph(sessionId as string),
    enabled: !!sessionId,
    staleTime: 0,
  });
}

export function useActiveChainQuery(
  sessionId: string | null,
): UseQueryResult<VirtualNode[], Error> {
  return useQuery({
    queryKey: sessionId
      ? rhsKeys.activeChain(sessionId)
      : rhsKeys.activeChain("__none__"),
    queryFn: () => fetchActiveChain(sessionId as string),
    enabled: !!sessionId,
    staleTime: 0,
  });
}

export function useNodeDiffQuery(
  sessionId: string | null,
  nodeId: string | null,
): UseQueryResult<NodeDiff, Error> {
  return useQuery({
    queryKey:
      sessionId && nodeId
        ? rhsKeys.nodeDiff(sessionId, nodeId)
        : rhsKeys.nodeDiff("__none__", "__none__"),
    queryFn: () => fetchNodeDiff(sessionId as string, nodeId as string),
    enabled: !!sessionId && !!nodeId,
    staleTime: 0,
  });
}

export function useChangedFilesQuery(
  sessionId: string | null,
  nodeId: string | null,
): UseQueryResult<{ files: string[] }, Error> {
  return useQuery({
    queryKey:
      sessionId && nodeId
        ? rhsKeys.changedFiles(sessionId, nodeId)
        : rhsKeys.changedFiles("__none__", "__none__"),
    queryFn: () => fetchChangedFiles(sessionId as string, nodeId as string),
    enabled: !!sessionId && !!nodeId,
    staleTime: 0,
  });
}

export function useValidateHeadQuery(
  sessionId: string | null,
): UseQueryResult<ValidationResult, Error> {
  return useQuery({
    queryKey: sessionId
      ? rhsKeys.validateHead(sessionId)
      : rhsKeys.validateHead("__none__"),
    queryFn: () => fetchValidateHead(sessionId as string),
    enabled: !!sessionId,
    staleTime: 0,
  });
}

export function useEdgeRefinementQuery(
  sessionId: string | null,
  targetNodeId: string | null,
): UseQueryResult<EdgeRefinementDetail, Error> {
  return useQuery({
    queryKey:
      sessionId && targetNodeId
        ? rhsKeys.edge(sessionId, targetNodeId)
        : rhsKeys.edge("__none__", "__none__"),
    queryFn: () => fetchEdge(sessionId as string, targetNodeId as string),
    enabled: !!sessionId && !!targetNodeId,
    staleTime: 0,
  });
}

export function useInProgressRefinementQuery(
  sessionId: string | null,
): UseQueryResult<EdgeRefinement | null, Error> {
  return useQuery({
    queryKey: sessionId
      ? rhsKeys.inProgressRefinement(sessionId)
      : rhsKeys.inProgressRefinement("__none__"),
    queryFn: () => fetchInProgressRefinement(sessionId as string),
    enabled: !!sessionId,
    staleTime: 0,
  });
}
