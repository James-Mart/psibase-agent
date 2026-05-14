import { execFile } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { promisify } from "util";

import { REPO_ROOT, WORKTREES_DIR } from "../../config.js";
import {
  deleteRhsSession as dbDeleteSession,
  deleteRhsEdgeRefinement,
  deleteRhsNode,
  getInProgressEdgeRefinementForSession,
  getRhsEdgeRefinement,
  getRhsNode,
  getRhsSessionById,
  getRhsSessionByWorkerBranch,
  getRunningRhsRunForSession,
  insertRhsEdgeRefinement,
  insertRhsNode,
  insertRhsSession,
  listRhsNodesForSession,
  listRhsSessionsForWorker,
  setRhsEdgeRefinementPlan,
  setRhsEdgeRefinementStatus,
  setRhsEdgeRefinementSurvey,
  setRhsSessionActiveHead,
  setRhsSessionModel,
  setRhsSessionPrep,
  updateRhsNodeParent,
  type RhsEdgeRefinementMode,
  type RhsEdgeRefinementRow,
  type RhsEdgeRefinementStatus,
  type RhsNodeRow,
  type RhsSessionRow,
} from "../../db.js";
import { HttpError } from "../../errors.js";
import { getCurrentBranch } from "../git.js";
import {
  addInternalWorktree,
  branchExistsInMainRepo,
  changedFiles,
  commitTree,
  createBranchInMainRepo,
  listBranchCommitsSinceMergeBase,
  readFileAtTree,
  removeInternalWorktree,
  resetWorktreeToCommit,
  resolveCommit,
  resolveTree,
  stageAll,
  treeOf,
  unifiedDiff,
  writeTree,
} from "./git.js";

const execFileP = promisify(execFile);

const REVIEW_SYNTHESIS_ROOT = join(WORKTREES_DIR, "_review-synthesis");
const DEFAULT_MODEL_ID = "composer-2";

export function synthesisWorktreePath(sessionId: string): string {
  return join(REVIEW_SYNTHESIS_ROOT, sessionId, "synthesis");
}

export interface VirtualNodeView {
  nodeId: string;
  parentNodeId: string | null;
  treeId: string;
  commitSha: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SessionView {
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
  prepStatus: RhsSessionRow["prep_status"];
  prepError: string | null;
  modelId: string;
  createdAt: string;
}

export interface EdgeRefinementView {
  sessionId: string;
  targetNodeId: string;
  mode: RhsEdgeRefinementMode;
  userConcern: string | null;
  changeSurvey: unknown | null;
  semanticPlan: unknown | null;
  status: RhsEdgeRefinementStatus;
  createdAt: string;
}

function rowToSessionView(row: RhsSessionRow): SessionView {
  return {
    id: row.id,
    workerName: row.worker_name,
    workerBranch: row.worker_branch,
    baseRef: row.base_ref,
    sourceRef: row.source_ref,
    baseTree: row.base_tree,
    finalTree: row.final_tree,
    baseNodeId: row.base_node_id,
    activeHeadId: row.active_head_id,
    synthesisWorktree: row.synthesis_worktree,
    prepStatus: row.prep_status,
    prepError: row.prep_error,
    modelId: row.model_id,
    createdAt: row.created_at,
  };
}

function rowToNodeView(row: RhsNodeRow): VirtualNodeView {
  return {
    nodeId: row.node_id,
    parentNodeId: row.parent_node_id,
    treeId: row.tree_id,
    commitSha: row.commit_sha,
    title: row.title,
    message: row.message,
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : null,
    createdAt: row.created_at,
  };
}

function rowToEdgeRefinementView(row: RhsEdgeRefinementRow): EdgeRefinementView {
  return {
    sessionId: row.session_id,
    targetNodeId: row.target_node_id,
    mode: row.mode,
    userConcern: row.user_concern,
    changeSurvey: row.change_survey_json
      ? JSON.parse(row.change_survey_json)
      : null,
    semanticPlan: row.plan_json ? JSON.parse(row.plan_json) : null,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function getSessionById(sessionId: string): SessionView {
  const row = getRhsSessionById(sessionId);
  if (!row) throw new HttpError(404, `Session ${sessionId} not found`);
  return rowToSessionView(row);
}

export function getSessionForWorkerBranch(
  workerName: string,
  workerBranch: string,
): SessionView | null {
  const row = getRhsSessionByWorkerBranch(workerName, workerBranch);
  return row ? rowToSessionView(row) : null;
}

export function listSessionsForWorker(workerName: string): SessionView[] {
  return listRhsSessionsForWorker(workerName).map(rowToSessionView);
}

export interface CreateSessionInput {
  workerName: string;
  workerDir: string;
  baseRef: string;
  sourceRef: string;
  modelId?: string;
}

export function createSession(input: CreateSessionInput): SessionView {
  const workerBranch = getCurrentBranch(input.workerDir);
  if (!workerBranch || workerBranch === "(unknown)") {
    throw new HttpError(
      400,
      "Worker is on an unknown or detached branch; cannot create review-history session",
    );
  }

  const existing = getRhsSessionByWorkerBranch(input.workerName, workerBranch);
  if (existing) {
    throw new HttpError(
      409,
      `A review-history session already exists for ${input.workerName}@${workerBranch}`,
      { sessionId: existing.id },
    );
  }

  let baseTree: string;
  let finalTree: string;
  try {
    baseTree = resolveTree(input.baseRef, input.workerDir);
    finalTree = resolveTree(input.sourceRef, input.workerDir);
  } catch (err) {
    throw new HttpError(400, "Failed to resolve base/source ref to a tree", {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const sessionId = randomUUID();
  const baseNodeId = randomUUID();
  const finalNodeId = randomUUID();
  const baseCommit = commitTree(baseTree, null, "review-history session base");
  const finalCommit = commitTree(
    finalTree,
    baseCommit,
    "review-history session final",
  );
  const synthesisWorktree = synthesisWorktreePath(sessionId);

  insertRhsNode({
    sessionId,
    nodeId: baseNodeId,
    parentNodeId: null,
    treeId: baseTree,
    commitSha: baseCommit,
    title: `base (${input.baseRef})`,
    message: null,
    metadataJson: JSON.stringify({ kind: "base" }),
  });

  insertRhsNode({
    sessionId,
    nodeId: finalNodeId,
    parentNodeId: baseNodeId,
    treeId: finalTree,
    commitSha: finalCommit,
    title: `final (${input.sourceRef})`,
    message: null,
    metadataJson: JSON.stringify({ kind: "final" }),
  });

  insertRhsSession({
    id: sessionId,
    workerName: input.workerName,
    workerBranch,
    baseRef: input.baseRef,
    sourceRef: input.sourceRef,
    baseTree,
    finalTree,
    baseNodeId,
    activeHeadId: finalNodeId,
    synthesisWorktree,
    modelId: input.modelId ?? DEFAULT_MODEL_ID,
  });

  void prepareSynthesisWorktreeAsync(sessionId, synthesisWorktree, baseCommit);

  return getSessionById(sessionId);
}

async function prepareSynthesisWorktreeAsync(
  sessionId: string,
  synthesisWorktree: string,
  baseCommit: string,
): Promise<void> {
  try {
    mkdirSync(dirname(synthesisWorktree), { recursive: true });
    addInternalWorktree(baseCommit, synthesisWorktree);
    await execFileP("bash", [".vscode/scripts/env-setup.sh"], {
      cwd: synthesisWorktree,
      timeout: 300_000,
    });
    setRhsSessionPrep(sessionId, "ready", null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setRhsSessionPrep(sessionId, "failed", message.slice(0, 4000));
  }
}

export function updateModelId(sessionId: string, modelId: string): SessionView {
  if (!modelId.trim()) throw new HttpError(400, "model id is required");
  setRhsSessionModel(sessionId, modelId.trim());
  return getSessionById(sessionId);
}

export function deleteSession(sessionId: string): void {
  const row = getRhsSessionById(sessionId);
  if (!row) return;
  removeInternalWorktree(row.synthesis_worktree);
  const sessionDir = dirname(row.synthesis_worktree);
  if (existsSync(sessionDir)) {
    try {
      rmSync(sessionDir, { recursive: true, force: true });
    } catch {}
  }
  dbDeleteSession(row.id);
}

export function ensureNoRunningRun(sessionId: string): void {
  const running = getRunningRhsRunForSession(sessionId);
  if (running) {
    throw new HttpError(
      409,
      `Run ${running.id} is already in progress for this session`,
      { runId: running.id, kind: running.kind, targetNodeId: running.target_node_id },
    );
  }
}

export function ensureSessionReady(sessionId: string): SessionView {
  const session = getSessionById(sessionId);
  if (session.prepStatus !== "ready") {
    throw new HttpError(
      409,
      `Synthesis worktree is not ready (status: ${session.prepStatus})`,
    );
  }
  return session;
}

export function getNode(sessionId: string, nodeId: string): VirtualNodeView {
  const row = getRhsNode(sessionId, nodeId);
  if (!row) throw new HttpError(404, `Node ${nodeId} not found`);
  return rowToNodeView(row);
}

export function listNodes(sessionId: string): VirtualNodeView[] {
  return listRhsNodesForSession(sessionId).map(rowToNodeView);
}

export interface NodeGraph {
  baseNodeId: string;
  activeHeadId: string;
  nodes: VirtualNodeView[];
  activeChainIds: string[];
}

export function getNodeGraph(sessionId: string): NodeGraph {
  const session = getSessionById(sessionId);
  const nodes = listNodes(sessionId);
  return {
    baseNodeId: session.baseNodeId,
    activeHeadId: session.activeHeadId,
    nodes,
    activeChainIds: getActiveChainIds(sessionId),
  };
}

function getActiveChainIds(sessionId: string): string[] {
  const session = getSessionById(sessionId);
  const ids: string[] = [];
  let current: string | null = session.activeHeadId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    ids.push(current);
    const row = getRhsNode(sessionId, current);
    if (!row) break;
    current = row.parent_node_id;
  }
  return ids.reverse();
}

export function getActiveChain(sessionId: string): VirtualNodeView[] {
  return getActiveChainIds(sessionId).map((id) => getNode(sessionId, id));
}

export function getNodeDiff(sessionId: string, nodeId: string): {
  parentTree: string | null;
  tree: string;
  diff: string;
} {
  const node = getNode(sessionId, nodeId);
  const parentTree = node.parentNodeId
    ? getNode(sessionId, node.parentNodeId).treeId
    : null;
  if (!parentTree) {
    return { parentTree: null, tree: node.treeId, diff: "" };
  }
  return {
    parentTree,
    tree: node.treeId,
    diff: unifiedDiff(parentTree, node.treeId),
  };
}

export function getChangedFilesBetweenNodes(
  sessionId: string,
  fromNodeId: string,
  toNodeId: string,
): string[] {
  const from = getNode(sessionId, fromNodeId);
  const to = getNode(sessionId, toNodeId);
  return changedFiles(from.treeId, to.treeId);
}

export function getNodeFile(
  sessionId: string,
  nodeId: string,
  path: string,
): string | null {
  const node = getNode(sessionId, nodeId);
  return readFileAtTree(node.treeId, path);
}

export interface ValidationResult {
  ok: boolean;
  detail?: string;
  expectedTree?: string;
  actualTree?: string;
}

export function validateActiveHeadEqualsFinal(sessionId: string): ValidationResult {
  const session = getSessionById(sessionId);
  const head = getNode(sessionId, session.activeHeadId);
  if (head.treeId === session.finalTree) return { ok: true };
  return {
    ok: false,
    detail: "active head's tree does not match final tree",
    expectedTree: session.finalTree,
    actualTree: head.treeId,
  };
}

export interface CheckpointInput {
  sessionId: string;
  parentNodeId: string;
  title: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
  setAsActiveHead?: boolean;
}

export function checkpointSynthesisWorktree(
  input: CheckpointInput,
): VirtualNodeView {
  const session = ensureSessionReady(input.sessionId);
  const parent = getNode(input.sessionId, input.parentNodeId);
  stageAll(session.synthesisWorktree);
  const treeSha = writeTree(session.synthesisWorktree);
  const commitSha = commitTree(treeSha, parent.commitSha, input.title);
  resetWorktreeToCommit(session.synthesisWorktree, commitSha);
  const nodeId = randomUUID();
  insertRhsNode({
    sessionId: input.sessionId,
    nodeId,
    parentNodeId: input.parentNodeId,
    treeId: treeSha,
    commitSha,
    title: input.title,
    message: input.message ?? null,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  });
  if (input.setAsActiveHead !== false) {
    setRhsSessionActiveHead(input.sessionId, nodeId);
  }
  return getNode(input.sessionId, nodeId);
}

export function getEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
): EdgeRefinementView | null {
  const row = getRhsEdgeRefinement(sessionId, targetNodeId);
  return row ? rowToEdgeRefinementView(row) : null;
}

export function getInProgressRefinement(
  sessionId: string,
): EdgeRefinementView | null {
  const row = getInProgressEdgeRefinementForSession(sessionId);
  return row ? rowToEdgeRefinementView(row) : null;
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

export function beginEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
  mode: RhsEdgeRefinementMode,
  userConcern: string | null,
): EdgeRefinementContext {
  ensureNoRunningRun(sessionId);
  const session = ensureSessionReady(sessionId);
  if (targetNodeId === session.baseNodeId) {
    throw new HttpError(400, "Cannot refine the base node's incoming edge");
  }
  const target = getNode(sessionId, targetNodeId);
  if (!target.parentNodeId) {
    throw new HttpError(400, "Cannot refine the base node's incoming edge");
  }
  if (mode === "synthesis" && !userConcern?.trim()) {
    throw new HttpError(
      400,
      "userConcern is required for intermediate-synthesis refinements",
    );
  }
  const inProgress = getInProgressEdgeRefinementForSession(sessionId);
  if (inProgress) {
    throw new HttpError(
      409,
      `A refinement is already in progress for this session`,
      { targetNodeId: inProgress.target_node_id, mode: inProgress.mode },
    );
  }
  const existing = getRhsEdgeRefinement(sessionId, targetNodeId);
  if (existing && existing.status === "completed") {
    throw new HttpError(
      409,
      "This edge has already been refined; refine a downstream edge instead",
    );
  }
  const before = getNode(sessionId, target.parentNodeId);

  insertRhsEdgeRefinement({
    sessionId,
    targetNodeId,
    mode,
    userConcern: userConcern?.trim() || null,
  });

  resetWorktreeToCommit(session.synthesisWorktree, before.commitSha);
  setRhsSessionActiveHead(sessionId, before.nodeId);

  return {
    sessionId,
    beforeNodeId: before.nodeId,
    targetNodeId: target.nodeId,
    beforeCommit: before.commitSha,
    targetCommit: target.commitSha,
    edgeDiff: unifiedDiff(before.treeId, target.treeId),
    mode,
  };
}

export interface EdgeRefinementResult {
  lastIntermediateNodeId: string;
  reparentedChildren: VirtualNodeView[];
}

export function completeEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
  intermediateNodeIds: string[],
): EdgeRefinementResult {
  if (intermediateNodeIds.length === 0) {
    throw new HttpError(400, "Refinement requires at least one intermediate node");
  }
  const refinement = getRhsEdgeRefinement(sessionId, targetNodeId);
  if (!refinement || refinement.status !== "in_progress") {
    throw new HttpError(409, "No in-progress refinement for this edge");
  }
  const target = getNode(sessionId, targetNodeId);
  const lastIntermediate = getNode(
    sessionId,
    intermediateNodeIds[intermediateNodeIds.length - 1]!,
  );
  if (lastIntermediate.treeId !== target.treeId) {
    throw new HttpError(
      500,
      "Last intermediate's tree does not match target's tree",
      {
        expectedTree: target.treeId,
        actualTree: lastIntermediate.treeId,
      },
    );
  }

  const reparented: VirtualNodeView[] = [];
  for (const child of listRhsNodesForSession(sessionId)) {
    if (child.parent_node_id === target.nodeId) {
      updateRhsNodeParent(sessionId, child.node_id, lastIntermediate.nodeId);
      reparented.push(getNode(sessionId, child.node_id));
    }
  }

  deleteRhsNode(sessionId, target.nodeId);
  setRhsSessionActiveHead(sessionId, lastIntermediate.nodeId);
  setRhsEdgeRefinementStatus(sessionId, target.nodeId, "completed");

  return {
    lastIntermediateNodeId: lastIntermediate.nodeId,
    reparentedChildren: reparented,
  };
}

export function abandonEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
): void {
  ensureNoRunningRun(sessionId);
  const refinement = getRhsEdgeRefinement(sessionId, targetNodeId);
  if (!refinement || refinement.status !== "in_progress") return;
  const target = getNode(sessionId, targetNodeId);
  if (!target.parentNodeId) {
    throw new HttpError(400, "Cannot abandon refinement of the base edge");
  }
  const before = getNode(sessionId, target.parentNodeId);

  for (const intermediate of collectIntermediates(sessionId, before.nodeId, target.nodeId)) {
    deleteRhsNode(sessionId, intermediate.nodeId);
  }

  const session = getSessionById(sessionId);
  setRhsSessionActiveHead(sessionId, target.nodeId);
  if (existsSync(session.synthesisWorktree)) {
    resetWorktreeToCommit(session.synthesisWorktree, target.commitSha);
  }
  deleteRhsEdgeRefinement(sessionId, target.nodeId);
}

function collectIntermediates(
  sessionId: string,
  beforeNodeId: string,
  targetNodeId: string,
): VirtualNodeView[] {
  const allNodes = listNodes(sessionId);
  const byParent = new Map<string, VirtualNodeView[]>();
  for (const node of allNodes) {
    if (!node.parentNodeId) continue;
    const list = byParent.get(node.parentNodeId) ?? [];
    list.push(node);
    byParent.set(node.parentNodeId, list);
  }
  const out: VirtualNodeView[] = [];
  const stack: VirtualNodeView[] = byParent.get(beforeNodeId) ?? [];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeId === targetNodeId) continue;
    out.push(node);
    const children = byParent.get(node.nodeId);
    if (children) stack.push(...children);
  }
  return out;
}

export function getIntermediateNodeIds(
  sessionId: string,
  targetNodeId: string,
): string[] {
  const refinement = getRhsEdgeRefinement(sessionId, targetNodeId);
  if (!refinement || refinement.status !== "in_progress") return [];
  const session = getSessionById(sessionId);
  const target = getNode(sessionId, targetNodeId);
  if (!target.parentNodeId) return [];
  const before = getNode(sessionId, target.parentNodeId);
  const ids: string[] = [];
  let current: string | null = session.activeHeadId;
  while (current && current !== before.nodeId) {
    ids.push(current);
    const node = getRhsNode(sessionId, current);
    if (!node) break;
    current = node.parent_node_id;
  }
  return ids.reverse();
}

export function setAcceptedSurveyForEdge(
  sessionId: string,
  targetNodeId: string,
  survey: unknown,
): EdgeRefinementView {
  const refinement = getRhsEdgeRefinement(sessionId, targetNodeId);
  if (!refinement) {
    throw new HttpError(404, "No refinement in progress for this edge");
  }
  setRhsEdgeRefinementSurvey(sessionId, targetNodeId, JSON.stringify(survey));
  return getEdgeRefinement(sessionId, targetNodeId)!;
}

export function setAcceptedPlanForEdge(
  sessionId: string,
  targetNodeId: string,
  plan: unknown,
): EdgeRefinementView {
  const refinement = getRhsEdgeRefinement(sessionId, targetNodeId);
  if (!refinement) {
    throw new HttpError(404, "No refinement in progress for this edge");
  }
  setRhsEdgeRefinementPlan(sessionId, targetNodeId, JSON.stringify(plan));
  return getEdgeRefinement(sessionId, targetNodeId)!;
}

export interface ExportInput {
  sessionId: string;
  branchName: string;
  force?: boolean;
}

export interface ExportResult {
  branchName: string;
  tipCommit: string;
  tipTree: string;
  commits: { sha: string; subject: string }[];
}

export function exportActiveHistoryToBranch(input: ExportInput): ExportResult {
  const validation = validateActiveHeadEqualsFinal(input.sessionId);
  if (!validation.ok) {
    throw new HttpError(
      409,
      "Cannot export: active head tree does not match final tree",
      { ...validation } as Record<string, unknown>,
    );
  }

  if (
    branchExistsInMainRepo(input.branchName, REPO_ROOT) &&
    !input.force
  ) {
    throw new HttpError(
      409,
      `Branch ${input.branchName} already exists; pass force=true to overwrite`,
    );
  }

  const chain = getActiveChain(input.sessionId);
  if (chain.length < 2) {
    throw new HttpError(400, "Active chain has no commits to export");
  }

  let parent = chain[0]!.commitSha;
  for (let i = 1; i < chain.length; i++) {
    const node = chain[i]!;
    const newCommit = commitTree(node.treeId, parent, formatExportSubject(node));
    parent = newCommit;
  }

  createBranchInMainRepo(input.branchName, parent, { force: input.force });
  const tipTree = treeOf(parent);
  const baseCommit = chain[0]!.commitSha;
  const commits = listBranchCommitsSinceMergeBase(input.branchName, baseCommit);
  return {
    branchName: input.branchName,
    tipCommit: parent,
    tipTree,
    commits,
  };
}

function formatExportSubject(node: VirtualNodeView): string {
  if (node.message && node.message.trim()) {
    return `${node.title}\n\n${node.message.trim()}`;
  }
  return node.title;
}

export function verifyExportMatchesFinal(
  sessionId: string,
  branchName: string,
): ValidationResult {
  const session = getSessionById(sessionId);
  if (!branchExistsInMainRepo(branchName, REPO_ROOT)) {
    return { ok: false, detail: `Branch ${branchName} does not exist` };
  }
  const branchTree = resolveTree(branchName, REPO_ROOT);
  if (branchTree === session.finalTree) return { ok: true };
  return {
    ok: false,
    detail: "exported branch tip tree does not match final tree",
    expectedTree: session.finalTree,
    actualTree: branchTree,
  };
}

export function rollbackSynthesisToActiveHead(sessionId: string): void {
  const session = getSessionById(sessionId);
  const head = getNode(sessionId, session.activeHeadId);
  if (existsSync(session.synthesisWorktree)) {
    resetWorktreeToCommit(session.synthesisWorktree, head.commitSha);
  }
}

export function tearDownAllSessionsForWorker(workerName: string): void {
  for (const session of listRhsSessionsForWorker(workerName)) {
    removeInternalWorktree(session.synthesis_worktree);
    const sessionDir = dirname(session.synthesis_worktree);
    if (existsSync(sessionDir)) {
      try {
        rmSync(sessionDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

export function getActiveHeadCommit(sessionId: string): string {
  const session = getSessionById(sessionId);
  const head = getNode(sessionId, session.activeHeadId);
  return head.commitSha;
}

export function resolveSourceRefCommit(
  workerDir: string,
  sourceRef: string,
): string {
  return resolveCommit(sourceRef, workerDir);
}
