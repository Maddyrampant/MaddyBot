import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textToSpeech, transcribeAudio, extractTextFromMedia } from "./ai.js";
import { pushVoice } from "./redis.js";
import {
  runFFmpeg,
  tmpPathFor,
  ensureTmpDir,
  cleanupFile,
  downloadFile,
} from "./image.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, "data", "tts");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function detectLang(text) {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text) ? "fa" : "en";
}

async function ensureCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function cacheKey(text, voice) {
  return createHash("sha256").update(String(voice) + "|" + text).digest("hex");
}

/* Serialize Gemini TTS calls (it is rate-limited on free tier) and cache
 * generated voices on disk so repeated phrases cost no API calls. */
let ttsQueue = Promise.resolve();
let lastTTSAt = 0;

const TTS_MIN_GAP_MS = 15000;

function enqueueTTS(text) {
  const run = async () => {
    const gap = Math.max(0, TTS_MIN_GAP_MS - (Date.now() - lastTTSAt));
    if (gap > 0) await sleep(gap);
    lastTTSAt = Date.now();
    return textToSpeech(text);
  };
  const p = ttsQueue.then(run, run);
  ttsQueue = p.then(() => {}, () => {});
  return p;
}

function parseL16(mime) {
  const m = String(mime).match(/^audio\/L16;\s*rate=(\d+)/i);
  return m ? { rate: Number(m[1]) || 24000 } : null;
}

async function convertToOgg(buffer, mime) {
  await ensureTmpDir();
  const l16 = parseL16(mime);
  let ext = "bin";
  if (/mpeg/.test(mime || "")) ext = "mp3";
  else if (/wav/i.test(mime || "")) ext = "wav";
  else if (/ogg|opus/i.test(mime || "")) ext = "ogg";
  const input = tmpPathFor(ext);
  const out = tmpPathFor("ogg");
  await fs.writeFile(input, buffer);
  const attempts = l16 ? [["-f", "s16le", "-ar", String(l16.rate), "-ac", "1"]] : [];
  attempts.push([]);
  let lastErr = null;
  for (const pre of attempts) {
    try {
      await runFFmpeg([...pre, "-i", input, "-c:a", "libopus", "-b:a", "48k", "-ar", "24000", "-ac", "1", out], 60000);
      const result = await fs.readFile(out);
      await cleanupFile(input);
      await cleanupFile(out);
      return result;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) console.warn("ogg conversion failed:", lastErr.message);
  await cleanupFile(out);
  const result = await fs.readFile(input);
  await cleanupFile(input);
  return null;
}

/**
 * Convert text to a Telegram voice message (ogg/opus) using Gemini TTS,
 * with an on-disk cache keyed by text+voice.
 * @returns {Promise<{buffer:Buffer, mime:string, ext:string}>}
 */
export async function speak(text) {
  const clean = String(text || "").trim().slice(0, 3000);
  if (!clean) throw new Error("EMPTY_TEXT");

  const key = cacheKey(clean, "");
  const cachedPath = path.join(CACHE_DIR, key + ".ogg");
  try {
    await ensureCache();
    const cached = await fs.readFile(cachedPath);
    const result = { buffer: cached, mime: "audio/ogg", ext: "ogg", cached: true };
    void pushVoice({ text: clean, ...result }).catch(() => {});
    return result;
  } catch {}

  const out = await enqueueTTS(clean);
  const ogg = await convertToOgg(out.buffer, out.mimeType);
  if (ogg) {
    await ensureCache();
    await fs.writeFile(cachedPath, ogg).catch(() => {});
    const result = { buffer: ogg, mime: "audio/ogg", ext: "ogg" };
    void pushVoice({ text: clean, ...result }).catch(() => {});
    return result;
  }
  const mime = out.mimeType || "audio/ogg";
  const result = { buffer: out.buffer, mime, ext: mime.includes("mpeg") ? "mp3" : "ogg" };
  void pushVoice({ text: clean, ...result }).catch(() => {});
  return result;
}

/**
 * Download and transcribe a voice/video-note file.
 * @returns {Promise<string>}
 */
export async function transcribeVoice(ctx, fileId, mimeType) {
  const mime = mimeType || "audio/ogg";
  const ext = /video/i.test(mime) ? "mp4" : /mpeg|mp3/i.test(mime) ? "mp3" : "ogg";
  const f = await downloadFile(ctx, fileId, ext, mime);
  try {
    const buffer = await fs.readFile(f.path);
    return await transcribeAudio(buffer, mime);
  } finally {
    await cleanupFile(f.path);
  }
}

/**
 * Download and extract text from a document (PDF / Word / txt).
 * Plain-text files are read directly; everything else goes to Gemini vision.
 * @returns {Promise<string>}
 */
export async function extractDocText(ctx, fileId, name, mimeType) {
  const ext = name ? path.extname(name).toLowerCase() : "";
  let mime = mimeType;
  if (!mime) {
    mime =
      ext === ".pdf" ? "application/pdf"
        : ext === ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : ext === ".doc" ? "application/msword"
            : "text/plain";
  }
  const f = await downloadFile(ctx, fileId, ext.replace(/^\./, "") || "bin", mime);
  try {
    const buffer = await fs.readFile(f.path);
    if (ext === ".txt" || ext === ".md" || /^text\//i.test(mime)) {
      return buffer.toString("utf8").slice(0, 20000);
    }
    return await extractTextFromMedia(buffer, mime);
  } finally {
    await cleanupFile(f.path);
  }
}
