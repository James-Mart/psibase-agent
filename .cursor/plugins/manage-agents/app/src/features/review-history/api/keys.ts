export const rhsKeys = {
  all: ["review-history"] as const,
  apiKeyStatus: () => [...rhsKeys.all, "api-key-status"] as const,
  models: () => [...rhsKeys.all, "models"] as const,
  sessionForWorker: (workerName: string) =>
    [...rhsKeys.all, "session-for-worker", workerName] as const,
  session: (sessionId: string) =>
    [...rhsKeys.all, "session", sessionId] as const,
  graph: (sessionId: string) =>
    [...rhsKeys.all, "graph", sessionId] as const,
  nodeDiff: (sessionId: string, nodeId: string) =>
    [...rhsKeys.all, "node-diff", sessionId, nodeId] as const,
  changedFiles: (sessionId: string, nodeId: string) =>
    [...rhsKeys.all, "changed-files", sessionId, nodeId] as const,
  validateCanonicalChain: (sessionId: string) =>
    [...rhsKeys.all, "validate-canonical-chain", sessionId] as const,
  edge: (sessionId: string, targetNodeId: string) =>
    [...rhsKeys.all, "edge", sessionId, targetNodeId] as const,
  inProgressRefinement: (sessionId: string) =>
    [...rhsKeys.all, "in-progress-refinement", sessionId] as const,
};
