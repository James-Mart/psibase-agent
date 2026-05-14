import { request } from "./client";
import type {
  AvailableModel,
  EdgeRefinementContext,
  EdgeRefinementDetail,
  EdgeRefinement,
  ExportResult,
  NodeDiff,
  NodeGraph,
  RhsEdgeRefinementMode,
  RhsRun,
  RhsRunKind,
  RhsSession,
  RhsSessionEnvelope,
  ValidationResult,
  VirtualNode,
} from "@/features/review-history/types";

export function fetchApiKeyStatus(): Promise<{ ok: boolean }> {
  return request("/api/review-history/api-key-status");
}

export function fetchAvailableModels(): Promise<{ items: AvailableModel[] }> {
  return request("/api/review-history/models");
}

export function fetchSessionForWorker(
  workerName: string,
): Promise<RhsSessionEnvelope> {
  return request(
    `/api/workers/${encodeURIComponent(workerName)}/review-history/session`,
  );
}

export function createSession(
  workerName: string,
  body: { baseRef: string; sourceRef: string; modelId?: string },
): Promise<RhsSession> {
  return request(
    `/api/workers/${encodeURIComponent(workerName)}/review-history/session`,
    { method: "POST", body },
  );
}

export function deleteSessionForWorker(
  workerName: string,
): Promise<{ ok: true }> {
  return request(
    `/api/workers/${encodeURIComponent(workerName)}/review-history/session`,
    { method: "DELETE" },
  );
}

export function patchModel(
  workerName: string,
  modelId: string,
): Promise<RhsSession> {
  return request(
    `/api/workers/${encodeURIComponent(workerName)}/review-history/session/model`,
    { method: "PATCH", body: { modelId } },
  );
}

export function fetchSession(sessionId: string): Promise<RhsSession> {
  return request(`/api/review-history/sessions/${sessionId}`);
}

export function deleteSessionById(sessionId: string): Promise<{ ok: true }> {
  return request(`/api/review-history/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export function fetchActiveChain(sessionId: string): Promise<VirtualNode[]> {
  return request(`/api/review-history/sessions/${sessionId}/active-chain`);
}

export function fetchNodeGraph(sessionId: string): Promise<NodeGraph> {
  return request(`/api/review-history/sessions/${sessionId}/graph`);
}

export function fetchNodeDiff(
  sessionId: string,
  nodeId: string,
): Promise<NodeDiff> {
  return request(
    `/api/review-history/sessions/${sessionId}/nodes/${nodeId}/diff`,
  );
}

export function fetchChangedFiles(
  sessionId: string,
  nodeId: string,
): Promise<{ files: string[] }> {
  return request(
    `/api/review-history/sessions/${sessionId}/nodes/${nodeId}/changed-files`,
  );
}

export function fetchValidateHead(sessionId: string): Promise<ValidationResult> {
  return request(
    `/api/review-history/sessions/${sessionId}/validate-head`,
  );
}

export function fetchInProgressRefinement(
  sessionId: string,
): Promise<EdgeRefinement | null> {
  return request(
    `/api/review-history/sessions/${sessionId}/in-progress-refinement`,
  );
}

export function fetchEdge(
  sessionId: string,
  targetNodeId: string,
): Promise<EdgeRefinementDetail> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}`,
  );
}

export function beginEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
  body: { mode: RhsEdgeRefinementMode; userConcern?: string | null },
): Promise<EdgeRefinementContext> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}/begin`,
    { method: "POST", body },
  );
}

export function startEdgeRun(
  sessionId: string,
  targetNodeId: string,
  body: {
    kind: RhsRunKind;
    parentRunId?: number;
    itemId?: string;
    userFeedback?: string;
  },
): Promise<{ runId: number }> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}/runs`,
    { method: "POST", body },
  );
}

export function cancelEdgeRun(
  sessionId: string,
  targetNodeId: string,
  runId: number,
): Promise<{ ok: true }> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}/runs/${runId}`,
    { method: "DELETE" },
  );
}

export function acceptEdgeSurvey(
  sessionId: string,
  targetNodeId: string,
  runId: number,
): Promise<EdgeRefinement> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}/survey/accept`,
    { method: "POST", body: { runId } },
  );
}

export function acceptEdgePlan(
  sessionId: string,
  targetNodeId: string,
  runId: number,
): Promise<EdgeRefinement> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}/plan/accept`,
    { method: "POST", body: { runId } },
  );
}

export function constructAllRemainingForEdge(
  sessionId: string,
  targetNodeId: string,
): Promise<{ ok: true }> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}/construct-all-remaining`,
    { method: "POST" },
  );
}

export function completeEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
  intermediateNodeIds: string[],
): Promise<unknown> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}/complete`,
    { method: "POST", body: { intermediateNodeIds } },
  );
}

export function abandonEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
): Promise<{ ok: true }> {
  return request(
    `/api/review-history/sessions/${sessionId}/edges/${targetNodeId}/abandon`,
    { method: "POST" },
  );
}

export function exportBranch(
  sessionId: string,
  branchName: string,
  force = false,
): Promise<ExportResult> {
  return request(
    `/api/review-history/sessions/${sessionId}/export`,
    { method: "POST", body: { branchName, force } },
  );
}

export function verifyExport(
  sessionId: string,
  branchName: string,
): Promise<ValidationResult> {
  return request(
    `/api/review-history/sessions/${sessionId}/verify`,
    { method: "POST", body: { branchName } },
  );
}

export function fetchEdgeRun(
  sessionId: string,
  runId: number,
): Promise<RhsRun> {
  return request(`/api/review-history/sessions/${sessionId}/runs/${runId}`);
}
