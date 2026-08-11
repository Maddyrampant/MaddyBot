import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { getDb } from "./db.js";
import { embed, singlePrompt } from "./ai.js";

// ---------------- legacy JSON memory store ----------------

export class MemoryStore {
  constructor(file, maxTurns = 10) {
    this.file = file;
    this.maxTurns = maxTurns;
    this.data = {};
    this.load();
  }

  load() {
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(readFileSync(this.file, "utf8"));
      } catch {
        this.data = {};
      }
    }
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  get(id) {
    return this.data[id] || [];
  }

  push(id, text, role = "user") {
    const history = this.get(id);
    history.push({ role, text });
    const limit = this.maxTurns * 2;
    if (history.length > limit) {
      history.splice(0, history.length - limit);
    }
    this.data[id] = history;
    this.save();
    return history;
  }

  clear(id) {
    delete this.data[id];
    this.save();
  }
}

// ---------------- smart long-term memory (SQLite) ----------------

const SIM_THRESHOLD = 0.85;
const MAX_MEMORY_LEN = 500;
const SUMMARIZE_AT = 40;
const SUMMARIZE_KEEP = 30;

const summarizeLocks = new Map();

function toBuffer(f32) {
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

function fromBuffer(buf) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function setKV(key, value) {
  getDb()
    .prepare(
      "INSERT INTO keyvalues (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, typeof value === "string" ? value : JSON.stringify(value));
}

export function getKVJSON(key) {
  const row = getDb().prepare("SELECT value FROM keyvalues WHERE key = ?").get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export async function remember(userId, text, type = "fact", source = "manual") {
  text = String(text).trim();
  if (!text) return null;
  const db = getDb();
  let embedding = null;
  try {
    embedding = await embed(text);
  } catch {
    embedding = null;
  }
  if (embedding) {
    const existing = db
      .prepare("SELECT id, embedding FROM memories WHERE user_id = ? AND embedding IS NOT NULL")
      .all(userId);
    for (const row of existing) {
      if (cosine(fromBuffer(row.embedding), embedding) > SIM_THRESHOLD) {
        return { id: row.id, existed: true };
      }
    }
  }
  const info = db
    .prepare(
      "INSERT INTO memories (user_id, text, type, embedding, source, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(userId, text.slice(0, MAX_MEMORY_LEN), type, embedding ? toBuffer(embedding) : null, source, Date.now());
  return { id: Number(info.lastInsertRowid), existed: false };
}

export async function searchMemories(userId, query, limit = 5) {
  if (!query) return [];
  const db = getDb();
  let qemb = null;
  try {
    qemb = await embed(query);
  } catch {
    qemb = null;
  }
  const rows = db
    .prepare("SELECT id, text, type, created_at, embedding FROM memories WHERE user_id = ?")
    .all(userId);
  const scored = [];
  for (const row of rows) {
    let score = 0;
    if (qemb && row.embedding) {
      score = cosine(fromBuffer(row.embedding), qemb);
    }
    scored.push({ score, row });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0.25)
    .slice(0, limit)
    .map((s) => ({
      id: s.row.id,
      text: s.row.text,
      type: s.row.type,
      score: Math.round(s.score * 100),
      created_at: s.row.created_at,
    }));
}

export function listMemories(userId, limit = 50) {
  return getDb()
    .prepare(
      "SELECT id, text, type, source, created_at FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(userId, limit);
}

export function countMemories(userId) {
  return getDb().prepare("SELECT COUNT(*) c FROM memories WHERE user_id = ?").get(userId).c;
}

export function forgetMemoryById(userId, id) {
  return getDb().prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").run(id, userId).changes;
}

export function forgetAll(userId) {
  return getDb().prepare("DELETE FROM memories WHERE user_id = ?").run(userId).changes;
}

export async function getFactsForPrompt(userId, query, limit = 5) {
  const mems = await searchMemories(userId, query, limit).catch(() => []);
  if (!mems.length) return "";
  return (
    "Facts you know about this person:\n" +
    mems
      .map((m, i) => `${i + 1}. ${m.text}`)
      .join("\n")
  );
}

export function addMessage(userId, role, text) {
  const db = getDb();
  db.prepare("INSERT INTO conversations (user_id, role, text, ts) VALUES (?, ?, ?, ?)").run(
    userId,
    role,
    String(text).slice(0, 4000),
    Date.now()
  );
  maybeSummarize(userId);
}

export function getRecentConversation(userId, limit = 20) {
  const db = getDb();
  return db
    .prepare("SELECT role, text FROM conversations WHERE user_id = ? ORDER BY ts DESC LIMIT ?")
    .all(userId, limit)
    .reverse();
}

export function countConversations(userId) {
  return getDb().prepare("SELECT COUNT(*) c FROM conversations WHERE user_id = ?").get(userId).c;
}

export function getLatestSummary(userId) {
  const row = getDb()
    .prepare("SELECT text FROM summaries WHERE user_id = ? ORDER BY ts DESC LIMIT 1")
    .get(userId);
  return row ? row.text : "";
}

export async function buildContext(userId, query) {
  const summary = getLatestSummary(userId);
  const recent = getRecentConversation(userId, 20);
  const last = recent.filter((m) => m.role === "user").pop();
  const facts = await getFactsForPrompt(userId, query || (last && last.text) || "", 5).catch(
    () => ""
  );
  return { summary, recent, facts };
}

function maybeSummarize(userId) {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) c FROM conversations WHERE user_id = ?").get(userId).c;
  if (count <= SUMMARIZE_AT) return;
  const old = db
    .prepare("SELECT id, role, text FROM conversations WHERE user_id = ? ORDER BY ts ASC LIMIT ?")
    .all(userId, count - SUMMARIZE_KEEP);
  if (!old.length) return;
  void summarizeMessages(userId, old);
}

async function summarizeMessages(userId, rows) {
  if (summarizeLocks.get(userId)) return;
  summarizeLocks.set(userId, true);
  try {
    const transcript = rows
      .map((r) => (r.role === "user" ? "User: " : "Assistant: ") + r.text)
      .join("\n")
      .slice(0, 30000);
    const prev = getLatestSummary(userId);
    const prompt =
      "You keep a running summary of a chat. Given the previous summary (if any) and the new messages, " +
      "write an updated concise summary that captures the important facts, decisions, preferences and ongoing topics. " +
      "Answer in the language of the conversation (mostly Persian).\n\n" +
      "Previous summary:\n" +
      (prev || "(none)") +
      "\n\nNew messages:\n" +
      transcript;
    const out = await singlePrompt(prompt);
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO summaries (user_id, text, ts) VALUES (?, ?, ?)").run(
        userId,
        out.slice(0, 4000),
        Date.now()
      );
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...ids);
    });
    tx();
  } catch {
    // summarization is best-effort; keep messages on failure
  } finally {
    summarizeLocks.delete(userId);
  }
}

export async function extractFacts(userId, texts) {
  const combined = texts
    .filter(Boolean)
    .join("\n")
    .slice(0, 20000);
  if (!combined.trim()) return 0;
  const prompt =
    "From the following conversation, extract up to 3 durable personal facts worth remembering long-term: " +
    "preferences, important life events, names, projects, recurring topics. " +
    'Output ONLY a JSON array of strings, for example ["likes espresso", "works on a Telegram bot"]. ' +
    'If nothing is worth remembering output [].\n\nConversation:\n' +
    combined;
  try {
    const out = await singlePrompt(prompt);
    const match = out.match(/\[[\s\S]*\]/);
    if (!match) return 0;
    const facts = JSON.parse(match[0]);
    let added = 0;
    for (const f of facts.slice(0, 3)) {
      if (typeof f === "string" && f.trim().length > 3) {
        const res = await remember(userId, f, "fact", "auto");
        if (res && !res.existed) added++;
      }
    }
    return added;
  } catch {
    return 0;
  }
}

export function resetConversation(userId) {
  const db = getDb();
  db.prepare("DELETE FROM conversations WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM summaries WHERE user_id = ?").run(userId);
}

export function dbStats() {
  const d = getDb();
  const out = {};
  for (const t of ["memories", "conversations", "summaries"]) {
    try {
      out[t] = d.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    } catch {
      out[t] = 0;
    }
  }
  return out;
}
