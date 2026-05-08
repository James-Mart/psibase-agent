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
    chain_port INTEGER,
    chat_agent_id TEXT
  )
`);

try {
  db.exec(`ALTER TABLE workers ADD COLUMN chat_agent_id TEXT`);
} catch {
  // column already exists
}


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
  getChatAgentId: db.prepare("SELECT chat_agent_id FROM workers WHERE name = ?"),
  upsertChatAgentId: db.prepare(
    "INSERT INTO workers (name, chat_agent_id) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET chat_agent_id = excluded.chat_agent_id",
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

export function getChatAgentId(name: string): string | null {
  const row = stmts.getChatAgentId.get(name) as { chat_agent_id: string | null } | undefined;
  return row?.chat_agent_id ?? null;
}

export function upsertChatAgentId(name: string, agentId: string): void {
  stmts.upsertChatAgentId.run(name, agentId);
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
