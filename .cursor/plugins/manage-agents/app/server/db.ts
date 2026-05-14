import Database from "better-sqlite3";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const APP_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const DB_PATH = join(APP_ROOT, "manage-agents.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Per-worker tables: any table keyed by a worker's `name` MUST be cleaned up
// in BOTH `deleteWorker` and `renameWorker` (services/workers.ts). When you
// add a new per-worker table here, add a `delete*ForWorker` and a
// `rename*ForWorker` helper alongside the existing ones and wire both into
// those flows.
db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    name TEXT PRIMARY KEY,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    source_branch TEXT NOT NULL DEFAULT 'origin/main',
    chain_port INTEGER
  )
`);


db.exec(`
  CREATE TABLE IF NOT EXISTS chains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_name TEXT NOT NULL,
    port INTEGER NOT NULL,
    launch_pid INTEGER NOT NULL,
    launch_started_at TEXT NOT NULL,
    launch_finished_at TEXT,
    launch_exit_code INTEGER,
    boot_pid INTEGER,
    boot_started_at TEXT,
    boot_finished_at TEXT,
    boot_exit_code INTEGER,
    cancelled INTEGER NOT NULL DEFAULT 0
  )
`);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_chains_worker ON chains(worker_name, launch_started_at DESC)`,
);

db.exec(`
  CREATE TABLE IF NOT EXISTS builds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_name TEXT NOT NULL,
    pid INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    exit_code INTEGER,
    cancelled INTEGER NOT NULL DEFAULT 0
  )
`);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_builds_worker ON builds(worker_name, started_at DESC)`,
);

db.exec(`
  CREATE TABLE IF NOT EXISTS request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER NOT NULL,
    duration_ms REAL NOT NULL
  )
`);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_request_log_ts ON request_log (ts)`,
);

db.exec(`
  CREATE TABLE IF NOT EXISTS rhs_sessions (
    id TEXT PRIMARY KEY,
    worker_name TEXT NOT NULL,
    worker_branch TEXT NOT NULL,
    base_ref TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    base_tree TEXT NOT NULL,
    final_tree TEXT NOT NULL,
    base_node_id TEXT NOT NULL,
    active_head_id TEXT NOT NULL,
    synthesis_worktree TEXT NOT NULL,
    prep_status TEXT NOT NULL DEFAULT 'preparing',
    prep_error TEXT,
    model_id TEXT NOT NULL DEFAULT 'composer-2',
    created_at TEXT NOT NULL,
    UNIQUE (worker_name, worker_branch)
  )
`);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_rhs_sessions_worker ON rhs_sessions(worker_name)`,
);

db.exec(`
  CREATE TABLE IF NOT EXISTS rhs_nodes (
    session_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    parent_node_id TEXT,
    tree_id TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, node_id)
  )
`);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_rhs_nodes_session ON rhs_nodes(session_id)`,
);

db.exec(`
  CREATE TABLE IF NOT EXISTS rhs_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    parent_run_id INTEGER,
    agent_id TEXT NOT NULL,
    sdk_run_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    item_id TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    result_json TEXT
  )
`);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_rhs_runs_session ON rhs_runs(session_id, started_at DESC)`,
);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_rhs_runs_edge ON rhs_runs(session_id, target_node_id, started_at DESC)`,
);

db.exec(`
  CREATE TABLE IF NOT EXISTS rhs_edge_refinements (
    session_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    user_concern TEXT,
    change_survey_json TEXT,
    plan_json TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, target_node_id)
  )
`);

const stmts = {
  get: db.prepare("SELECT note, status FROM workers WHERE name = ?"),
  upsert: db.prepare(
    "INSERT INTO workers (name, note) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET note = excluded.note",
  ),
  upsertStatus: db.prepare(
    "INSERT INTO workers (name, status) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET status = excluded.status",
  ),
  getStatus: db.prepare("SELECT status FROM workers WHERE name = ?"),
  upsertSourceBranch: db.prepare(
    "INSERT INTO workers (name, source_branch) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET source_branch = excluded.source_branch",
  ),
  getSourceBranch: db.prepare("SELECT source_branch FROM workers WHERE name = ?"),
  rename: db.prepare("UPDATE workers SET name = ? WHERE name = ?"),
  delete: db.prepare("DELETE FROM workers WHERE name = ?"),
  insertBuild: db.prepare(
    "INSERT INTO builds (worker_name, pid, started_at) VALUES (?, ?, ?)",
  ),
  setBuildFinished: db.prepare(
    "UPDATE builds SET finished_at = ?, exit_code = ?, cancelled = ? WHERE id = ? AND finished_at IS NULL",
  ),
  getLatestBuild: db.prepare(
    "SELECT id, worker_name, pid, started_at, finished_at, exit_code, cancelled FROM builds WHERE worker_name = ? ORDER BY started_at DESC LIMIT 1",
  ),
  listLatestBuilds: db.prepare(
    `SELECT b.id, b.worker_name, b.pid, b.started_at, b.finished_at, b.exit_code, b.cancelled
       FROM builds b
       JOIN (
         SELECT worker_name, MAX(started_at) AS max_started
           FROM builds
          GROUP BY worker_name
       ) m ON m.worker_name = b.worker_name AND m.max_started = b.started_at`,
  ),
  listUnfinishedBuilds: db.prepare(
    `SELECT id, worker_name, pid, started_at, finished_at, exit_code, cancelled
       FROM builds WHERE finished_at IS NULL`,
  ),
  deleteBuildsForWorker: db.prepare("DELETE FROM builds WHERE worker_name = ?"),
  renameBuildsForWorker: db.prepare(
    "UPDATE builds SET worker_name = ? WHERE worker_name = ?",
  ),
  insertRequestLog: db.prepare(
    "INSERT INTO request_log (method, path, status, duration_ms) VALUES (?, ?, ?, ?)",
  ),
  getChainPort: db.prepare("SELECT chain_port FROM workers WHERE name = ?"),
  upsertChainPort: db.prepare(
    "INSERT INTO workers (name, chain_port) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET chain_port = excluded.chain_port",
  ),
  listAssignedChainPorts: db.prepare(
    "SELECT chain_port FROM workers WHERE chain_port IS NOT NULL",
  ),
  insertChain: db.prepare(
    "INSERT INTO chains (worker_name, port, launch_pid, launch_started_at) VALUES (?, ?, ?, ?)",
  ),
  setChainBootStarted: db.prepare(
    "UPDATE chains SET boot_pid = ?, boot_started_at = ? WHERE id = ?",
  ),
  setChainBootFinished: db.prepare(
    "UPDATE chains SET boot_finished_at = ?, boot_exit_code = ? WHERE id = ?",
  ),
  setChainLaunchFinished: db.prepare(
    "UPDATE chains SET launch_finished_at = ?, launch_exit_code = ?, cancelled = ? WHERE id = ? AND launch_finished_at IS NULL",
  ),
  getLatestChain: db.prepare(
    "SELECT * FROM chains WHERE worker_name = ? ORDER BY launch_started_at DESC LIMIT 1",
  ),
  listLatestChains: db.prepare(
    `SELECT c.*
       FROM chains c
       JOIN (
         SELECT worker_name, MAX(launch_started_at) AS max_started
           FROM chains
          GROUP BY worker_name
       ) m ON m.worker_name = c.worker_name AND m.max_started = c.launch_started_at`,
  ),
  listUnfinishedChains: db.prepare(
    "SELECT * FROM chains WHERE launch_finished_at IS NULL",
  ),
  deleteChainsForWorker: db.prepare("DELETE FROM chains WHERE worker_name = ?"),
  renameChainsForWorker: db.prepare(
    "UPDATE chains SET worker_name = ? WHERE worker_name = ?",
  ),
  insertRhsSession: db.prepare(
    `INSERT INTO rhs_sessions
       (id, worker_name, worker_branch, base_ref, source_ref, base_tree, final_tree,
        base_node_id, active_head_id, synthesis_worktree, model_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  getRhsSessionById: db.prepare("SELECT * FROM rhs_sessions WHERE id = ?"),
  getRhsSessionByWorkerBranch: db.prepare(
    "SELECT * FROM rhs_sessions WHERE worker_name = ? AND worker_branch = ?",
  ),
  listRhsSessionsForWorker: db.prepare(
    "SELECT * FROM rhs_sessions WHERE worker_name = ? ORDER BY created_at DESC",
  ),
  setRhsSessionPrep: db.prepare(
    "UPDATE rhs_sessions SET prep_status = ?, prep_error = ? WHERE id = ?",
  ),
  setRhsSessionActiveHead: db.prepare(
    "UPDATE rhs_sessions SET active_head_id = ? WHERE id = ?",
  ),
  setRhsSessionModel: db.prepare(
    "UPDATE rhs_sessions SET model_id = ? WHERE id = ?",
  ),
  deleteRhsSession: db.prepare("DELETE FROM rhs_sessions WHERE id = ?"),
  deleteRhsSessionsForWorker: db.prepare(
    "DELETE FROM rhs_sessions WHERE worker_name = ?",
  ),
  renameRhsSessionsForWorker: db.prepare(
    "UPDATE rhs_sessions SET worker_name = ? WHERE worker_name = ?",
  ),
  insertRhsNode: db.prepare(
    `INSERT INTO rhs_nodes
       (session_id, node_id, parent_node_id, tree_id, commit_sha, title, message, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  getRhsNode: db.prepare(
    "SELECT * FROM rhs_nodes WHERE session_id = ? AND node_id = ?",
  ),
  listRhsNodesForSession: db.prepare(
    "SELECT * FROM rhs_nodes WHERE session_id = ? ORDER BY created_at ASC",
  ),
  updateRhsNodeParent: db.prepare(
    "UPDATE rhs_nodes SET parent_node_id = ? WHERE session_id = ? AND node_id = ?",
  ),
  deleteRhsNode: db.prepare(
    "DELETE FROM rhs_nodes WHERE session_id = ? AND node_id = ?",
  ),
  deleteRhsNodesForSession: db.prepare(
    "DELETE FROM rhs_nodes WHERE session_id = ?",
  ),
  insertRhsRun: db.prepare(
    `INSERT INTO rhs_runs
       (session_id, target_node_id, parent_run_id, agent_id, sdk_run_id, kind, item_id, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  getRhsRun: db.prepare("SELECT * FROM rhs_runs WHERE id = ?"),
  getRunningRhsRunForSession: db.prepare(
    "SELECT * FROM rhs_runs WHERE session_id = ? AND status = 'running' LIMIT 1",
  ),
  listRhsRunsForSession: db.prepare(
    "SELECT * FROM rhs_runs WHERE session_id = ? ORDER BY started_at DESC LIMIT ?",
  ),
  listRhsRunsForEdge: db.prepare(
    "SELECT * FROM rhs_runs WHERE session_id = ? AND target_node_id = ? ORDER BY started_at DESC LIMIT ?",
  ),
  setRhsRunFinished: db.prepare(
    "UPDATE rhs_runs SET status = ?, finished_at = ?, result_json = ? WHERE id = ? AND status = 'running'",
  ),
  deleteRhsRunsForSession: db.prepare(
    "DELETE FROM rhs_runs WHERE session_id = ?",
  ),
  insertRhsEdgeRefinement: db.prepare(
    `INSERT INTO rhs_edge_refinements
       (session_id, target_node_id, mode, user_concern, status, created_at)
     VALUES (?, ?, ?, ?, 'in_progress', ?)`,
  ),
  getRhsEdgeRefinement: db.prepare(
    "SELECT * FROM rhs_edge_refinements WHERE session_id = ? AND target_node_id = ?",
  ),
  getInProgressEdgeRefinementForSession: db.prepare(
    "SELECT * FROM rhs_edge_refinements WHERE session_id = ? AND status = 'in_progress' LIMIT 1",
  ),
  setRhsEdgeRefinementSurvey: db.prepare(
    "UPDATE rhs_edge_refinements SET change_survey_json = ? WHERE session_id = ? AND target_node_id = ?",
  ),
  setRhsEdgeRefinementPlan: db.prepare(
    "UPDATE rhs_edge_refinements SET plan_json = ? WHERE session_id = ? AND target_node_id = ?",
  ),
  setRhsEdgeRefinementStatus: db.prepare(
    "UPDATE rhs_edge_refinements SET status = ? WHERE session_id = ? AND target_node_id = ?",
  ),
  deleteRhsEdgeRefinement: db.prepare(
    "DELETE FROM rhs_edge_refinements WHERE session_id = ? AND target_node_id = ?",
  ),
  deleteRhsEdgeRefinementsForSession: db.prepare(
    "DELETE FROM rhs_edge_refinements WHERE session_id = ?",
  ),
};

export function getNote(name: string): string {
  const row = stmts.get.get(name) as { note: string } | undefined;
  return row?.note ?? "";
}

export function upsertNote(name: string, note: string): void {
  stmts.upsert.run(name, note);
}

export function renameWorker(oldName: string, newName: string): void {
  stmts.rename.run(newName, oldName);
}

export function deleteWorker(name: string): void {
  stmts.delete.run(name);
}

export interface BuildRow {
  id: number;
  worker_name: string;
  pid: number;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  cancelled: number;
}

export function insertBuild(
  workerName: string,
  pid: number,
  startedAt: string,
): number {
  const result = stmts.insertBuild.run(workerName, pid, startedAt);
  return Number(result.lastInsertRowid);
}

export function setBuildFinished(
  id: number,
  exitCode: number | null,
  cancelled: boolean,
): boolean {
  const result = stmts.setBuildFinished.run(
    new Date().toISOString(),
    exitCode,
    cancelled ? 1 : 0,
    id,
  );
  return result.changes > 0;
}

export function getLatestBuildForWorker(name: string): BuildRow | undefined {
  return stmts.getLatestBuild.get(name) as BuildRow | undefined;
}

export function listLatestBuilds(): BuildRow[] {
  return stmts.listLatestBuilds.all() as BuildRow[];
}

export function listUnfinishedBuilds(): BuildRow[] {
  return stmts.listUnfinishedBuilds.all() as BuildRow[];
}

export function deleteBuildsForWorker(name: string): void {
  stmts.deleteBuildsForWorker.run(name);
}

export function renameBuildsForWorker(oldName: string, newName: string): void {
  stmts.renameBuildsForWorker.run(newName, oldName);
}

export type WorkerStatus = "active" | "blocked" | "inactive";

export function getStatus(name: string): WorkerStatus {
  const row = stmts.getStatus.get(name) as { status: string } | undefined;
  const val = row?.status;
  if (val === "blocked" || val === "inactive") return val;
  return "active";
}

export function upsertStatus(name: string, status: WorkerStatus): void {
  stmts.upsertStatus.run(name, status);
}

export function getSourceBranch(name: string): string {
  const row = stmts.getSourceBranch.get(name) as { source_branch: string } | undefined;
  return row?.source_branch ?? "origin/main";
}

export function upsertSourceBranch(name: string, sourceBranch: string): void {
  stmts.upsertSourceBranch.run(name, sourceBranch);
}

export interface RequestLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

export function logRequest(entry: RequestLogEntry): void {
  stmts.insertRequestLog.run(
    entry.method,
    entry.path,
    entry.status,
    entry.durationMs,
  );
}

// --- Chain port helpers ---

export function getChainPort(name: string): number | null {
  const row = stmts.getChainPort.get(name) as { chain_port: number | null } | undefined;
  return row?.chain_port ?? null;
}

export function upsertChainPort(name: string, port: number): void {
  stmts.upsertChainPort.run(name, port);
}

export function listAssignedChainPorts(): number[] {
  const rows = stmts.listAssignedChainPorts.all() as { chain_port: number }[];
  return rows.map((r) => r.chain_port);
}

// --- Chain run helpers ---

export interface ChainRow {
  id: number;
  worker_name: string;
  port: number;
  launch_pid: number;
  launch_started_at: string;
  launch_finished_at: string | null;
  launch_exit_code: number | null;
  boot_pid: number | null;
  boot_started_at: string | null;
  boot_finished_at: string | null;
  boot_exit_code: number | null;
  cancelled: number;
}

export function insertChain(
  workerName: string,
  port: number,
  launchPid: number,
  launchStartedAt: string,
): number {
  const result = stmts.insertChain.run(workerName, port, launchPid, launchStartedAt);
  return Number(result.lastInsertRowid);
}

export function setChainBootStarted(id: number, bootPid: number, bootStartedAt: string): void {
  stmts.setChainBootStarted.run(bootPid, bootStartedAt, id);
}

export function setChainBootFinished(id: number, exitCode: number | null): void {
  stmts.setChainBootFinished.run(new Date().toISOString(), exitCode, id);
}

export function setChainLaunchFinished(
  id: number,
  exitCode: number | null,
  cancelled: boolean,
): boolean {
  const result = stmts.setChainLaunchFinished.run(
    new Date().toISOString(),
    exitCode,
    cancelled ? 1 : 0,
    id,
  );
  return result.changes > 0;
}

export function getLatestChainForWorker(name: string): ChainRow | undefined {
  return stmts.getLatestChain.get(name) as ChainRow | undefined;
}

export function listLatestChains(): ChainRow[] {
  return stmts.listLatestChains.all() as ChainRow[];
}

export function listUnfinishedChains(): ChainRow[] {
  return stmts.listUnfinishedChains.all() as ChainRow[];
}

export function deleteChainsForWorker(name: string): void {
  stmts.deleteChainsForWorker.run(name);
}

export function renameChainsForWorker(oldName: string, newName: string): void {
  stmts.renameChainsForWorker.run(newName, oldName);
}

// --- Review History Synthesis (rhs_*) helpers ---

export type RhsPrepStatus = "preparing" | "ready" | "failed";

export interface RhsSessionRow {
  id: string;
  worker_name: string;
  worker_branch: string;
  base_ref: string;
  source_ref: string;
  base_tree: string;
  final_tree: string;
  base_node_id: string;
  active_head_id: string;
  synthesis_worktree: string;
  prep_status: RhsPrepStatus;
  prep_error: string | null;
  model_id: string;
  created_at: string;
}

export interface InsertRhsSessionInput {
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
  modelId: string;
}

export function insertRhsSession(input: InsertRhsSessionInput): void {
  stmts.insertRhsSession.run(
    input.id,
    input.workerName,
    input.workerBranch,
    input.baseRef,
    input.sourceRef,
    input.baseTree,
    input.finalTree,
    input.baseNodeId,
    input.activeHeadId,
    input.synthesisWorktree,
    input.modelId,
    new Date().toISOString(),
  );
}

export function getRhsSessionById(id: string): RhsSessionRow | undefined {
  return stmts.getRhsSessionById.get(id) as RhsSessionRow | undefined;
}

export function getRhsSessionByWorkerBranch(
  workerName: string,
  workerBranch: string,
): RhsSessionRow | undefined {
  return stmts.getRhsSessionByWorkerBranch.get(workerName, workerBranch) as
    | RhsSessionRow
    | undefined;
}

export function listRhsSessionsForWorker(workerName: string): RhsSessionRow[] {
  return stmts.listRhsSessionsForWorker.all(workerName) as RhsSessionRow[];
}

export function setRhsSessionPrep(
  id: string,
  status: RhsPrepStatus,
  error: string | null,
): void {
  stmts.setRhsSessionPrep.run(status, error, id);
}

export function setRhsSessionActiveHead(id: string, nodeId: string): void {
  stmts.setRhsSessionActiveHead.run(nodeId, id);
}

export function setRhsSessionModel(id: string, modelId: string): void {
  stmts.setRhsSessionModel.run(modelId, id);
}

export function deleteRhsSession(id: string): void {
  stmts.deleteRhsSession.run(id);
}

export function deleteRhsSessionsForWorker(workerName: string): RhsSessionRow[] {
  const sessions = listRhsSessionsForWorker(workerName);
  for (const s of sessions) {
    stmts.deleteRhsRunsForSession.run(s.id);
    stmts.deleteRhsEdgeRefinementsForSession.run(s.id);
    stmts.deleteRhsNodesForSession.run(s.id);
    stmts.deleteRhsSession.run(s.id);
  }
  return sessions;
}

export function renameRhsSessionsForWorker(
  oldName: string,
  newName: string,
): void {
  stmts.renameRhsSessionsForWorker.run(newName, oldName);
}

export interface RhsNodeRow {
  session_id: string;
  node_id: string;
  parent_node_id: string | null;
  tree_id: string;
  commit_sha: string;
  title: string;
  message: string | null;
  metadata_json: string | null;
  created_at: string;
}

export interface InsertRhsNodeInput {
  sessionId: string;
  nodeId: string;
  parentNodeId: string | null;
  treeId: string;
  commitSha: string;
  title: string;
  message?: string | null;
  metadataJson?: string | null;
}

export function insertRhsNode(input: InsertRhsNodeInput): void {
  stmts.insertRhsNode.run(
    input.sessionId,
    input.nodeId,
    input.parentNodeId,
    input.treeId,
    input.commitSha,
    input.title,
    input.message ?? null,
    input.metadataJson ?? null,
    new Date().toISOString(),
  );
}

export function getRhsNode(
  sessionId: string,
  nodeId: string,
): RhsNodeRow | undefined {
  return stmts.getRhsNode.get(sessionId, nodeId) as RhsNodeRow | undefined;
}

export function listRhsNodesForSession(sessionId: string): RhsNodeRow[] {
  return stmts.listRhsNodesForSession.all(sessionId) as RhsNodeRow[];
}

export function updateRhsNodeParent(
  sessionId: string,
  nodeId: string,
  parentNodeId: string | null,
): void {
  stmts.updateRhsNodeParent.run(parentNodeId, sessionId, nodeId);
}

export function deleteRhsNode(sessionId: string, nodeId: string): void {
  stmts.deleteRhsNode.run(sessionId, nodeId);
}

export type RhsRunKind = "survey" | "plan" | "construct";
export type RhsRunStatus = "running" | "finished" | "error" | "cancelled";

export interface RhsRunRow {
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

export interface InsertRhsRunInput {
  sessionId: string;
  targetNodeId: string;
  parentRunId: number | null;
  agentId: string;
  sdkRunId: string;
  kind: RhsRunKind;
  itemId: string | null;
}

export function insertRhsRun(input: InsertRhsRunInput): number {
  const result = stmts.insertRhsRun.run(
    input.sessionId,
    input.targetNodeId,
    input.parentRunId,
    input.agentId,
    input.sdkRunId,
    input.kind,
    input.itemId,
    "running",
    new Date().toISOString(),
  );
  return Number(result.lastInsertRowid);
}

export function getRhsRun(id: number): RhsRunRow | undefined {
  return stmts.getRhsRun.get(id) as RhsRunRow | undefined;
}

export function getRunningRhsRunForSession(
  sessionId: string,
): RhsRunRow | undefined {
  return stmts.getRunningRhsRunForSession.get(sessionId) as
    | RhsRunRow
    | undefined;
}

export function listRhsRunsForSession(
  sessionId: string,
  limit = 50,
): RhsRunRow[] {
  return stmts.listRhsRunsForSession.all(sessionId, limit) as RhsRunRow[];
}

export function listRhsRunsForEdge(
  sessionId: string,
  targetNodeId: string,
  limit = 50,
): RhsRunRow[] {
  return stmts.listRhsRunsForEdge.all(sessionId, targetNodeId, limit) as RhsRunRow[];
}

export function setRhsRunFinished(
  id: number,
  status: Exclude<RhsRunStatus, "running">,
  resultJson: string | null,
): boolean {
  const result = stmts.setRhsRunFinished.run(
    status,
    new Date().toISOString(),
    resultJson,
    id,
  );
  return result.changes > 0;
}

export type RhsEdgeRefinementMode = "partition" | "synthesis";
export type RhsEdgeRefinementStatus = "in_progress" | "completed";

export interface RhsEdgeRefinementRow {
  session_id: string;
  target_node_id: string;
  mode: RhsEdgeRefinementMode;
  user_concern: string | null;
  change_survey_json: string | null;
  plan_json: string | null;
  status: RhsEdgeRefinementStatus;
  created_at: string;
}

export interface InsertRhsEdgeRefinementInput {
  sessionId: string;
  targetNodeId: string;
  mode: RhsEdgeRefinementMode;
  userConcern: string | null;
}

export function insertRhsEdgeRefinement(
  input: InsertRhsEdgeRefinementInput,
): void {
  stmts.insertRhsEdgeRefinement.run(
    input.sessionId,
    input.targetNodeId,
    input.mode,
    input.userConcern,
    new Date().toISOString(),
  );
}

export function getRhsEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
): RhsEdgeRefinementRow | undefined {
  return stmts.getRhsEdgeRefinement.get(sessionId, targetNodeId) as
    | RhsEdgeRefinementRow
    | undefined;
}

export function getInProgressEdgeRefinementForSession(
  sessionId: string,
): RhsEdgeRefinementRow | undefined {
  return stmts.getInProgressEdgeRefinementForSession.get(sessionId) as
    | RhsEdgeRefinementRow
    | undefined;
}

export function setRhsEdgeRefinementSurvey(
  sessionId: string,
  targetNodeId: string,
  surveyJson: string,
): void {
  stmts.setRhsEdgeRefinementSurvey.run(surveyJson, sessionId, targetNodeId);
}

export function setRhsEdgeRefinementPlan(
  sessionId: string,
  targetNodeId: string,
  planJson: string,
): void {
  stmts.setRhsEdgeRefinementPlan.run(planJson, sessionId, targetNodeId);
}

export function setRhsEdgeRefinementStatus(
  sessionId: string,
  targetNodeId: string,
  status: RhsEdgeRefinementStatus,
): void {
  stmts.setRhsEdgeRefinementStatus.run(status, sessionId, targetNodeId);
}

export function deleteRhsEdgeRefinement(
  sessionId: string,
  targetNodeId: string,
): void {
  stmts.deleteRhsEdgeRefinement.run(sessionId, targetNodeId);
}
