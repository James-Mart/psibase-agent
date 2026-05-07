import Database from "better-sqlite3";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const APP_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const DB_PATH = join(APP_ROOT, "manage-agents.db");
const NOTES_DIR = join(APP_ROOT, "notes");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    name TEXT PRIMARY KEY,
    note TEXT NOT NULL DEFAULT ''
  )
`);

if (existsSync(NOTES_DIR)) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO workers (name, note) VALUES (?, ?)",
  );
  for (const file of readdirSync(NOTES_DIR)) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3);
    const note = readFileSync(join(NOTES_DIR, file), "utf-8");
    insert.run(name, note);
  }
}

const stmts = {
  get: db.prepare("SELECT note FROM workers WHERE name = ?"),
  upsert: db.prepare(
    "INSERT INTO workers (name, note) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET note = excluded.note",
  ),
  rename: db.prepare("UPDATE workers SET name = ? WHERE name = ?"),
  delete: db.prepare("DELETE FROM workers WHERE name = ?"),
};

export function getNote(name: string): string {
  const row = stmts.get.get(name) as { note: string } | undefined;
  return row?.note ?? "";
}

export function upsertNote(name: string, note: string): void {
  stmts.upsert.run(name, note);
}

export function renameNote(oldName: string, newName: string): void {
  stmts.rename.run(newName, oldName);
}

export function deleteNote(name: string): void {
  stmts.delete.run(name);
}
