export type RhsPrepStatus = "preparing" | "ready" | "failed";

export type RhsRunKind = "survey" | "plan" | "construct";

export type RhsRunStatus = "running" | "finished" | "error" | "cancelled";

export type RhsEdgeRefinementMode = "partition" | "synthesis";
export type RhsEdgeRefinementStatus = "in_progress" | "completed";

export interface ChangeSurvey {
  summary: string;
  touchedAreas: string[];
  notableChanges: string[];
  ambiguousOrRiskyAreas: string[];
}

export interface SemanticPlanItem {
  id: string;
  title: string;
  intent: string;
  dependencies: string[];
}

export interface SemanticPlan {
  items: SemanticPlanItem[];
}

export interface EdgeRefinementIntermediateItem {
  id: string;
  intent: string;
  dependencies: string[];
  message: string;
}

export interface EdgeRefinementPlan {
  intermediateItems: EdgeRefinementIntermediateItem[];
}

export interface EdgeRefinement {
  sessionId: string;
  targetNodeId: string;
  mode: RhsEdgeRefinementMode;
  userConcern: string | null;
  changeSurvey: ChangeSurvey | null;
  semanticPlan: SemanticPlan | EdgeRefinementPlan | null;
  status: RhsEdgeRefinementStatus;
  createdAt: string;
}

export interface RhsSession {
  id: string;
  workerName: string;
  workerBranch: string;
  baseRef: string;
  sourceRef: string;
  baseTree: string;
  finalTree: string;
  baseNodeId: string;
  activeHeadId: string;
  synthesisWorktree: string;
  prepStatus: RhsPrepStatus;
  prepError: string | null;
  modelId: string;
  createdAt: string;
  workerCurrentBranch?: string;
  isOnLockedBranch?: boolean;
}

export interface RhsSessionEnvelope {
  currentBranch: string;
  session: RhsSession | null;
}

export interface VirtualNode {
  nodeId: string;
  parentNodeId: string | null;
  treeId: string;
  commitSha: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NodeGraph {
  baseNodeId: string;
  activeHeadId: string;
  nodes: VirtualNode[];
  activeChainIds: string[];
}

export interface RhsRun {
  id: number;
  session_id: string;
  target_node_id: string;
  parent_run_id: number | null;
  agent_id: string;
  sdk_run_id: string;
  kind: RhsRunKind;
  item_id: string | null;
  status: RhsRunStatus;
  started_at: string;
  finished_at: string | null;
  result_json: string | null;
}

export interface ParsedRunOutput {
  ok: boolean;
  data?: unknown;
  text?: string;
  reason?: string;
  rawResult?: string;
}

export interface ValidationResult {
  ok: boolean;
  detail?: string;
  expectedTree?: string;
  actualTree?: string;
}

export interface NodeDiff {
  parentTree: string | null;
  tree: string;
  diff: string;
}

export interface ExportResult {
  branchName: string;
  tipCommit: string;
  tipTree: string;
  commits: { sha: string; subject: string }[];
}

export interface RhsRunEvent {
  runId: number;
  sessionId: string;
  targetNodeId: string;
  kind: RhsRunKind;
  type:
    | "started"
    | "sdk_message"
    | "stderr"
    | "finished"
    | "error"
    | "cancelled"
    | "loop_progress";
  payload?: unknown;
}

export interface EdgeRefinementContext {
  sessionId: string;
  beforeNodeId: string;
  targetNodeId: string;
  beforeCommit: string;
  targetCommit: string;
  edgeDiff: string;
  mode: RhsEdgeRefinementMode;
}

export interface EdgeRefinementDetail {
  refinement: EdgeRefinement | null;
  runs: RhsRun[];
  intermediateNodeIds: string[];
}

export interface AvailableModel {
  id: string;
  displayName: string;
  description?: string;
  aliases?: string[];
}
