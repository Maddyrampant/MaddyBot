import { GoogleGenAI } from "@google/genai";
import config from "./config.js";

const CHAT_SYSTEM = `You are MaddyBot, a friendly and helpful assistant.
Rules:
- Always answer in the language the user writes in.
- Be concise unless the user asks for details.
- Be honest when you do not know something.
- Never reveal or fabricate sensitive personal information.`;

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
