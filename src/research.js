import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { getDb } from "./db.js";
import { embed } from "./ai.js";
import config from "./config.js";

// ---------------- markdown report parsing ----------------

export function parseReport(md) {
  const text = String(md).replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let title = "";
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)/);
    if (m) {
      title = m[1].trim();
      break;
    }
  }
  const dateMatch = text.match(/\*\*تاریخ:\*\*\s*(.+)/);
  const reportMatch = text.match(/##\s*گزارش([\s\S]*?)(?=##\s|$)/);
  const sourcesMatch = text.match(/##\s*منابع([\s\S]*)$/);
  const body = (reportMatch ? reportMatch[1] : text).trim();
  const sources = [];
  if (sourcesMatch) {
    for (const m of sourcesMatch[1].matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
      if (!sources.includes(m[1])) sources.push(m[1]);
    }
  }
  return { title, date: dateMatch ? dateMatch[1].trim() : "", body, sources };
}

const WEAK_PATTERNS = [
  /عدم دسترسی به منابع/,
  /بدون دسترسی به منابع/,
  /هیچ منبعی/,
  /هیچ داده‌ای قابل اعتماد/,
  /در دسترس نیست/,
  /نمی‌توانم.*گزارش/,
  /قابل اعتماد ارائه نمی/,
];

export function isWeakReport(rep) {
  if (rep.sources.length === 0 && rep.body.length < 500) return true;
  return WEAK_PATTERNS.some((re) => re.test(rep.body));
}

export function chunkReport(rep, max = 1500) {
  const blocks = rep.body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const chunks = [];
  let cur = "";
  for (const b of blocks) {
    const piece = b.length > max ? b.slice(0, max) : b;
    if (cur && (cur + "\n\n" + piece).length > max) {
      chunks.push(cur);
      cur = piece;
    } else {
      cur = cur ? cur + "\n\n" + piece : piece;
    }
  }
  if (cur) chunks.push(cur);
  if (!chunks.length && rep.body) chunks.push(rep.body.slice(0, max));
  return chunks;
}

// ---------------- embeddings ----------------

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

function fileHash(file) {
  const st = statSync(file);
  return `${st.size}-${Math.floor(st.mtimeMs)}`;
}

function currentEmbedModel() {
  const useOllama =
    config.aiMode === "ollama" || (config.aiMode === "auto" && !config.geminiKey);
  return useOllama
    ? "ollama:" + config.ollamaEmbedModel
    : "gemini:" + (process.env.EMBED_MODEL || "gemini-embedding-001");
}

function ensureEmbedModel(db) {
  const row = db.prepare("SELECT value FROM keyvalues WHERE key = 'research.embedModel'").get();
  const cur = currentEmbedModel();
  if (row && row.value === cur) return;
  db.prepare("DELETE FROM research_embeddings").run();
  db.prepare("DELETE FROM research_docs").run();
  db.prepare(
    "INSERT INTO keyvalues (key, value) VALUES ('research.embedModel', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(cur);
}

// ---------------- sync / search ----------------

export async function syncResearch() {
  const db = getDb();
  const dir = config.researchDir;
  if (!dir || !existsSync(dir)) {
    return { enabled: false, indexed: 0, removed: 0, skipped: 0, total: 0 };
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  ensureEmbedModel(db);
  const knownRows = db.prepare("SELECT file, hash FROM research_docs").all();
  const known = new Map(knownRows.map((r) => [r.file, r.hash]));
  const seen = new Set();
  let indexed = 0;
  let skipped = 0;

  for (const f of files) {
    seen.add(f);
    const full = join(dir, f);
    let hash;
    let rep;
    try {
      hash = fileHash(full);
      rep = parseReport(readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    if (known.get(f) === hash) {
      skipped++;
      continue;
    }
    db.prepare("DELETE FROM research_docs WHERE file = ?").run(f);
    if (isWeakReport(rep)) {
      skipped++;
      continue;
    }
    db.prepare(
      "INSERT INTO research_docs (file, hash, title, date, sources) VALUES (?, ?, ?, ?, ?)"
    ).run(f, hash, rep.title, rep.date, JSON.stringify(rep.sources));
    const doc = db.prepare("SELECT id FROM research_docs WHERE file = ?").get(f);
    const chunks = chunkReport(rep);
    let ok = true;
    for (let i = 0; i < chunks.length; i++) {
      let emb = null;
      try {
        emb = await embed(`${rep.title}\n${chunks[i]}`);
      } catch {
        emb = null;
      }
      if (!emb) {
        ok = false;
        break;
      }
      db.prepare(
        "INSERT INTO research_embeddings (doc_id, file, chunk_index, title, text, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(doc.id, f, i, rep.title, chunks[i], toBuffer(emb), Date.now());
    }
    if (!ok) {
      db.prepare("DELETE FROM research_docs WHERE id = ?").run(doc.id);
      skipped++;
      continue;
    }
    indexed++;
  }

  let removed = 0;
  for (const row of knownRows) {
    if (!seen.has(row.file)) {
      db.prepare("DELETE FROM research_docs WHERE file = ?").run(row.file);
      removed++;
    }
  }
  const total = db.prepare("SELECT COUNT(*) c FROM research_docs").get().c;
  return { enabled: true, indexed, removed, skipped, total };
}

export async function searchResearch(query, limit = 3, minScore = 0.25) {
  if (!query) return [];
  const db = getDb();
  let qemb = null;
  try {
    qemb = await embed(query);
  } catch {
    qemb = null;
  }
  const rows = db
    .prepare(
      "SELECT id, doc_id, title, text, embedding FROM research_embeddings WHERE embedding IS NOT NULL"
    )
    .all();
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
    .filter((s) => s.score > minScore)
    .slice(0, limit)
    .map((s) => {
      const doc = db.prepare("SELECT date, sources FROM research_docs WHERE id = ?").get(s.row.doc_id);
      return {
        score: Math.round(s.score * 100),
        title: s.row.title,
        text: s.row.text,
        date: (doc && doc.date) || "",
        sources: doc ? JSON.parse(doc.sources || "[]") : [],
      };
    });
}

export function getResearchStats() {
  const db = getDb();
  const docs = db.prepare("SELECT COUNT(*) c FROM research_docs").get().c;
  const chunks = db.prepare("SELECT COUNT(*) c FROM research_embeddings").get().c;
  return { docs, chunks };
}
