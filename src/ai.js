import { GoogleGenAI } from "@google/genai";
import config from "./config.js";
import { completeOllama, chatOllamaStream, embedOllama } from "./ollama.js";

export const CHAT_SYSTEM = `You are Madellin, an extraordinarily intelligent and emotionally aware assistant.

How you think:
- Read the conversation with full attention. Notice what the user says AND what they do not say: their tone, mood, doubts and hidden needs.
- Connect the current message to what was said earlier in this chat, and use it.
- Never give generic answers. Be specific to this person and this moment.

How you answer:
- Always answer in the language the user writes in (mostly Persian).
- Be concise by default, but go deep when the topic needs it.
- Show that you understood them before giving your opinion or advice.
- Give smart, useful, honest answers. If you do not know, say so and suggest how to find out.
- Ask one sharp follow-up question when something important is unclear, instead of guessing.

Emotional intelligence:
- If the user seems upset, be warm and supportive first, solve the problem second.
- If the user is celebrating, celebrate with them genuinely.
- If the user contradicts themselves, point it out kindly.

You are not a simple bot: you analyze, you remember, you connect the dots, and you make the user feel genuinely understood.`;

const TASK_SYSTEM = `You are a precise assistant. Follow the user's instruction exactly, return only the requested output with no extra commentary.`;

let client = null;

export function initAI() {
  if (config.geminiKey) {
    client = new GoogleGenAI({ apiKey: config.geminiKey });
  }
  return client;
}

export function getAI() {
  return client;
}

function promptFromContents(contents) {
  const list = Array.isArray(contents) ? contents : [contents];
  return list
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && Array.isArray(c.parts)) {
        return c.parts
          .map((p) => (typeof p === "string" ? p : (p && p.text) || ""))
          .join("\n");
      }
      if (c && typeof c.text === "string") return c.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function useOllama() {
  if (config.aiMode === "ollama") return true;
  if (config.aiMode === "auto" && !config.geminiKey) return true;
  return false;
}

function isQuotaError(err) {
  const m = String((err && (err.message || err.status)) || "");
  return /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(m);
}

export async function generate(contents, system = TASK_SYSTEM, extra = {}) {
  if (useOllama()) {
    return completeOllama(promptFromContents(contents), [], system);
  }
  if (!config.geminiKey) {
    throw new Error("NO_GEMINI_KEY");
  }
  if (!client) initAI();
  try {
    const res = await client.models.generateContent({
      model: config.model,
      contents,
      systemInstruction: system,
      ...extra,
    });
    return (res.text || "").trim();
  } catch (err) {
    if (isQuotaError(err) && config.aiMode === "auto") {
      return completeOllama(promptFromContents(contents), [], system);
    }
    throw err;
  }
}

export function singlePrompt(prompt, system = TASK_SYSTEM) {
  return generate([{ role: "user", parts: [{ text: prompt }] }], system);
}

export function chat(prompt, history = [], system = CHAT_SYSTEM) {
  if (useOllama()) {
    return completeOllama(prompt, history, system);
  }
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];
  return generate(contents, system);
}

export async function* generateStream(contents, system = TASK_SYSTEM, extra = {}) {
  if (useOllama()) {
    yield* chatOllamaStream(promptFromContents(contents), [], system);
    return;
  }
  if (!config.geminiKey) throw new Error("NO_GEMINI_KEY");
  if (!client) initAI();
  try {
    const res = await client.models.generateContentStream({
      model: config.model,
      contents,
      systemInstruction: system,
      ...extra,
    });
    let prev = "";
    for await (const chunk of res) {
      const t = chunk.text || "";
      if (!t) continue;
      if (prev === "" || !t.startsWith(prev)) {
        yield t;
      } else {
        const delta = t.slice(prev.length);
        if (delta) yield delta;
      }
      prev = t;
    }
  } catch (err) {
    if (isQuotaError(err) && config.aiMode === "auto") {
      yield* chatOllamaStream(promptFromContents(contents), [], system);
      return;
    }
    throw err;
  }
}

export async function* chatStream(prompt, history = [], system = CHAT_SYSTEM) {
  if (useOllama()) {
    yield* chatOllamaStream(prompt, history, system);
    return;
  }
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];
  yield* generateStream(contents, system);
}

export async function generateWithMedia(prompt, media = [], system = TASK_SYSTEM, model = config.model) {
  if (!config.geminiKey) throw new Error("NO_GEMINI_KEY");
  if (!client) initAI();
  const parts = [{ text: prompt }];
  for (const m of media) {
    parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } });
  }
  const res = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    systemInstruction: system,
  });
  return (res.text || "").trim();
}

export async function transcribeAudio(buffer, mimeType = "audio/ogg") {
  const text = await generateWithMedia(
    "Transcribe this audio exactly. If it contains Persian, write the transcript in Persian; otherwise in the language being spoken. Return only the transcript text with no commentary.",
    [{ mimeType, data: buffer.toString("base64") }]
  );
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
}

export async function extractTextFromMedia(buffer, mimeType = "application/pdf") {
  const text = await generateWithMedia(
    "Extract ALL text from this document (PDF, Word, scanned page or image). Preserve the original language, headings and structure. If there is no readable text, reply exactly: NO_TEXT",
    [{ mimeType, data: buffer.toString("base64") }]
  );
  if (!text || text === "NO_TEXT") throw new Error("NO_TEXT");
  return text;
}

export async function textToSpeech(text) {
  if (!config.geminiKey) throw new Error("NO_GEMINI_KEY");
  if (!client) initAI();
  const model = config.ttsModel || "gemini-2.5-flash-preview-tts";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const parseRetryMs = (err) => {
    try {
      const j = JSON.parse(err.message);
      const info = j && j.error;
      const ri = info && info.details && info.details.find((d) => d["@type"] === "google.rpc.RetryInfo");
      if (ri && ri.retryDelay) {
        const s = parseFloat(ri.retryDelay);
        if (s > 0) return Math.min(s * 1000, 30000);
      }
    } catch {}
    return 0;
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: String(text) }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice || "Kore" } },
          },
        },
      });
      const cand = res.candidates && res.candidates[0];
      const part = cand && cand.content && cand.content.parts && cand.content.parts.find((p) => p.inlineData && p.inlineData.data);
      if (!part || !part.inlineData.data) throw new Error("TTS_EMPTY");
      return {
        buffer: Buffer.from(part.inlineData.data, "base64"),
        mimeType: part.inlineData.mimeType || "audio/ogg",
      };
    } catch (err) {
      const wait = parseRetryMs(err);
      const isFlakyText = /only be used for TTS/i.test(err.message || "");
      const isEmpty = err.message === "TTS_EMPTY";
      if (attempt < 2 && (wait > 0 || isFlakyText || isEmpty)) {
        await sleep(wait > 0 ? wait : 2000);
        continue;
      }
      throw err;
    }
  }
}

export async function embed(text) {
  if (useOllama()) return embedOllama(text);
  if (!config.geminiKey) throw new Error("NO_GEMINI_KEY");
  if (!client) initAI();
  const res = await client.models.embedContent({
    model: process.env.EMBED_MODEL || "gemini-embedding-001",
    contents: String(text).slice(0, 8000),
  });
  const vals = res.embeddings && res.embeddings[0] && res.embeddings[0].values;
  if (!vals) throw new Error("EMBED_EMPTY");
  return Float32Array.from(vals);
}
