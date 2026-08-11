import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

let db = null;

export function getDb() {
  if (db) return db;
  const file = process.env.DB_FILE || "data/maddy.db";
  mkdirSync(dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY,
      name       TEXT,
      username   TEXT,
      profile    TEXT DEFAULT '{}',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS memories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      text       TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'fact',
      embedding  BLOB,
      source     TEXT,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);

    CREATE TABLE IF NOT EXISTS conversations (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role    TEXT NOT NULL,
      text    TEXT NOT NULL,
      ts      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user_ts ON conversations(user_id, ts);

    CREATE TABLE IF NOT EXISTS summaries (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      text    TEXT NOT NULL,
      ts      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_summaries_user_ts ON summaries(user_id, ts);

    CREATE TABLE IF NOT EXISTS keyvalues (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}
