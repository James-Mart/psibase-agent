import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { messageOf } from "@/lib/utils/error-message";
import {
  abandonEdgeRefinement,
  acceptEdgePlan,
  acceptEdgeSurvey,
  beginEdgeRefinement,
  cancelEdgeRun,
  completeEdgeRefinement,
  constructAllRemainingForEdge,
  createSession,
  deleteSessionForWorker,
  exportBranch,
  patchModel,
  startEdgeRun,
  verifyExport,
} from "@/lib/api/review-history";
import type {
  RhsEdgeRefinementMode,
  RhsRunKind,
} from "../types";
import { rhsKeys } from "./keys";

export function useCreateSession(workerName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { baseRef: string; modelId?: string }) =>
      createSession(workerName, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rhsKeys.sessionForWorker(workerName) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useDeleteSession(workerName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteSessionForWorker(workerName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rhsKeys.sessionForWorker(workerName) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function usePatchModel(workerName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) => patchModel(workerName, modelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rhsKeys.sessionForWorker(workerName) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useBeginEdgeRefinement(sessionId: string, workerName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      targetNodeId: string;
      mode: RhsEdgeRefinementMode;
      userConcern?: string | null;
    }) =>
      beginEdgeRefinement(sessionId, vars.targetNodeId, {
        mode: vars.mode,
        userConcern: vars.userConcern ?? null,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: rhsKeys.edge(sessionId, vars.targetNodeId) });
      qc.invalidateQueries({ queryKey: rhsKeys.inProgressRefinement(sessionId) });
      qc.invalidateQueries({ queryKey: rhsKeys.graph(sessionId) });
      qc.invalidateQueries({ queryKey: rhsKeys.sessionForWorker(workerName) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useStartEdgeRun(sessionId: string, targetNodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      kind: RhsRunKind;
      parentRunId?: number;
      itemId?: string;
      userFeedback?: string;
    }) => startEdgeRun(sessionId, targetNodeId, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rhsKeys.edge(sessionId, targetNodeId) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useCancelEdgeRun(sessionId: string, targetNodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) => cancelEdgeRun(sessionId, targetNodeId, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rhsKeys.edge(sessionId, targetNodeId) });
      qc.invalidateQueries({ queryKey: rhsKeys.graph(sessionId) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useAcceptEdgeSurvey(sessionId: string, targetNodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) => acceptEdgeSurvey(sessionId, targetNodeId, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rhsKeys.edge(sessionId, targetNodeId) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useAcceptEdgePlan(sessionId: string, targetNodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) => acceptEdgePlan(sessionId, targetNodeId, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rhsKeys.edge(sessionId, targetNodeId) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useConstructAllRemaining(sessionId: string, targetNodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => constructAllRemainingForEdge(sessionId, targetNodeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rhsKeys.edge(sessionId, targetNodeId) });
      qc.invalidateQueries({ queryKey: rhsKeys.graph(sessionId) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useCompleteEdgeRefinement(sessionId: string, workerName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { targetNodeId: string; intermediateNodeIds: string[] }) =>
      completeEdgeRefinement(sessionId, vars.targetNodeId, vars.intermediateNodeIds),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: rhsKeys.edge(sessionId, vars.targetNodeId) });
      qc.invalidateQueries({ queryKey: rhsKeys.inProgressRefinement(sessionId) });
      qc.invalidateQueries({ queryKey: rhsKeys.graph(sessionId) });
      qc.invalidateQueries({ queryKey: rhsKeys.sessionForWorker(workerName) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useAbandonEdgeRefinement(sessionId: string, workerName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetNodeId: string) =>
      abandonEdgeRefinement(sessionId, targetNodeId),
    onSuccess: (_data, targetNodeId) => {
      qc.invalidateQueries({ queryKey: rhsKeys.edge(sessionId, targetNodeId) });
      qc.invalidateQueries({ queryKey: rhsKeys.inProgressRefinement(sessionId) });
      qc.invalidateQueries({ queryKey: rhsKeys.graph(sessionId) });
      qc.invalidateQueries({ queryKey: rhsKeys.sessionForWorker(workerName) });
    },
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useExportBranch(sessionId: string) {
  return useMutation({
    mutationFn: (vars: { branchName: string; force?: boolean }) =>
      exportBranch(sessionId, vars.branchName, vars.force),
    onError: (err) => toast.error(messageOf(err)),
  });
}

export function useVerifyExport(sessionId: string) {
  return useMutation({
    mutationFn: (branchName: string) => verifyExport(sessionId, branchName),
    onError: (err) => toast.error(messageOf(err)),
  });
}
