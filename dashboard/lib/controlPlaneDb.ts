import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | undefined;

export function db(): DatabaseSync {
  if (database) return database;
  const configuredPath = process.env.LEAKGUARD_DB_PATH
    ? resolve(process.env.LEAKGUARD_DB_PATH)
    : resolve(process.cwd(), ".leakguard-data", "control-plane.sqlite");
  let path = configuredPath;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (error) {
    if (!process.env.RENDER || !(error instanceof Error) || !("code" in error) || error.code !== "EACCES") throw error;
    // Render Free has no persistent disk. Keep the demo functional on its
    // ephemeral filesystem; /var/data is used automatically once a paid disk
    // is attached. Health/API responses expose persistence mode clearly.
    path = resolve(tmpdir(), "leakguard", "control-plane.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    process.env.LEAKGUARD_DB_EPHEMERAL = "true";
  }
  database = new DatabaseSync(path);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS repositories (
      full_name TEXT PRIMARY KEY, name TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'Unknown',
      html_url TEXT, private INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS people (
      login TEXT PRIMARY KEY, name TEXT NOT NULL, avatar_url TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repository_members (
      repository TEXT NOT NULL, login TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'contributor', updated_at TEXT NOT NULL,
      PRIMARY KEY (repository, login)
    );
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_key TEXT NOT NULL UNIQUE, repository TEXT NOT NULL,
      actor TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT, pr_number INTEGER, run_url TEXT,
      gate_status TEXT NOT NULL, scan_mode TEXT NOT NULL DEFAULT 'diff', definite INTEGER NOT NULL DEFAULT 0,
      likely INTEGER NOT NULL DEFAULT 0, possible INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL, detected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scans_repo_time ON scans(repository, detected_at DESC);
    CREATE INDEX IF NOT EXISTS scans_actor_time ON scans(actor, detected_at DESC);
    CREATE TABLE IF NOT EXISTS workflow_runs (
      run_id INTEGER PRIMARY KEY, repository TEXT NOT NULL, actor TEXT NOT NULL, branch TEXT NOT NULL,
      workflow TEXT NOT NULL, status TEXT NOT NULL, conclusion TEXT, run_url TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS workflow_repo_time ON workflow_runs(repository, created_at DESC);
    CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return database;
}

export function resetDbForTests(): void {
  database?.close();
  database = undefined;
}
