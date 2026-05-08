import Database from "better-sqlite3";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const APP_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const DB_PATH = join(APP_ROOT, "manage-agents.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    name TEXT PRIMARY KEY,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    source_branch TEXT NOT NULL DEFAULT 'origin/main'
  )
`);

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
  insertRequestLog: db.prepare(
    "INSERT INTO request_log (method, path, status, duration_ms) VALUES (?, ?, ?, ?)",
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
