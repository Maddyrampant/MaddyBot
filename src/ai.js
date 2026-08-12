import { GoogleGenAI } from "@google/genai";
import config from "./config.js";

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

export async function generate(contents, system = TASK_SYSTEM, extra = {}) {
  if (!config.geminiKey) {
    throw new Error("NO_GEMINI_KEY");
  }
  if (!client) initAI();
  const res = await client.models.generateContent({
    model: config.model,
    contents,
    systemInstruction: system,
    ...extra,
  });
  return (res.text || "").trim();
}

export function singlePrompt(prompt, system = TASK_SYSTEM) {
  return generate([{ role: "user", parts: [{ text: prompt }] }], system);
}

export function chat(prompt, history = [], system = CHAT_SYSTEM) {
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
  if (!config.geminiKey) throw new Error("NO_GEMINI_KEY");
  if (!client) initAI();
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
}

export async function* chatStream(prompt, history = [], system = CHAT_SYSTEM) {
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];
  yield* generateStream(contents, system);
}

export async function embed(text) {
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
