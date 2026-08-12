import Redis from "ioredis";
import config from "./config.js";

const VOICE_LIST = "maddy:voice";
const MAX_VOICES = 20;

let client = null;
let readyPromise = null;

function getClient() {
  if (!config.redisUrl) return null;
  if (client) return client;
  client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 3000)),
    enableOfflineQueue: false,
  });
  client.on("error", (err) => {
    console.warn("redis error:", err.message);
  });
  readyPromise = client.connect().catch((err) => {
    console.warn("redis unavailable:", err.message);
    readyPromise = null;
  });
  return client;
}

async function waitReady() {
  const c = getClient();
  if (!c) return false;
  await (readyPromise || Promise.resolve()).catch(() => {});
  return c.status === "ready";
}

export function redisEnabled() {
  return Boolean(config.redisUrl);
}

export async function redisStatus() {
  const c = getClient();
  if (!c) return { enabled: false, connected: false, list: VOICE_LIST, entries: 0, lastAt: null };
  const connected = await waitReady();
  let entries = 0;
  let last = null;
  if (connected) {
    try {
      const len = await c.llen(VOICE_LIST);
      entries = Number(len || 0);
      const tail = await c.lindex(VOICE_LIST, -1);
      if (tail) {
        try {
          last = JSON.parse(tail).at || null;
        } catch {
          last = null;
        }
      }
    } catch {
      /* redis not reachable right now */
    }
  }
  return { enabled: true, connected, list: VOICE_LIST, entries, lastAt: last };
}

export async function pushVoice({ text, buffer, mime, ext }) {
  const c = getClient();
  if (!c) return false;
  if (!(await waitReady())) return false;
  const entry = {
    at: Date.now(),
    text: String(text || "").slice(0, 1000),
    mime: mime || "audio/ogg",
    ext: ext || "ogg",
    data: buffer.toString("base64"),
  };
  try {
    const pipeline = c.multi();
    pipeline.rpush(VOICE_LIST, JSON.stringify(entry));
    pipeline.ltrim(VOICE_LIST, -MAX_VOICES, -1);
    await pipeline.exec();
    return true;
  } catch (err) {
    console.warn("redis push failed:", err.message);
    return false;
  }
}
