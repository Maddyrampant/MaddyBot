import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import config from "./config.js";
import { chatStream, CHAT_SYSTEM } from "./ai.js";
import {
  listMemories,
  countMemories,
  forgetMemoryById,
  addMessage,
  buildContext,
  extractFacts,
  dbStats,
} from "./memory.js";
import { allGroups, commandsByGroup, groupLabel, cmdDesc } from "./utils.js";
import { buildChildSystem } from "./commands/onboarding.js";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC_DIR = join(ROOT, "public");
const VERSION = "1.0.0";
const bootTime = Date.now();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function groupsMeta() {
  return allGroups()
    .map(([key]) => ({
      key,
      label: groupLabel(key),
      commands: commandsByGroup(key).map((c) => ({
        name: c.name,
        usage: c.usage,
        desc: cmdDesc(c.name) || c.desc,
      })),
    }))
    .filter((g) => g.commands.length);
}

function safeEqualHex(a, b) {
  try {
    const ha = Buffer.from(a, "hex");
    const hb = Buffer.from(b, "hex");
    if (ha.length !== hb.length) return false;
    return timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

export function validateInitData(initData) {
  try {
    const params = new URLSearchParams(String(initData));
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(config.botToken).digest();
    const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    if (!safeEqualHex(computed, hash)) return null;
    const authDate = Number(params.get("auth_date") || 0);
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
    let user = null;
    try {
      user = JSON.parse(params.get("user") || "null");
    } catch {}
    if (!user || !user.id) return null;
    return {
      id: user.id,
      first_name: user.first_name || "",
      username: user.username || "",
    };
  } catch {
    return null;
  }
}

function authUser(req) {
  if (config.webappAllowInsecure) {
    return { id: config.ownerId || 1, first_name: "Owner", username: "owner", insecure: true };
  }
  const init = req.headers["x-telegram-init-data"];
  if (!init) return null;
  return validateInitData(init);
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function notFound(res) {
  return json(res, 404, { ok: false, error: "not_found" });
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", () => (tooBig ? reject(new Error("too_large")) : resolve(data)));
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  let p = pathname === "/" ? "/index.html" : pathname;
  const file = normalize(join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR) || !existsSync(file) || statSync(file).isDirectory()) {
    return notFound(res);
  }
  res.writeHead(200, {
    "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(file).pipe(res);
}

function handleInit(req, res, user) {
  const memories = countMemories(user.id);
  const groups = groupsMeta();
  const total = groups.reduce((n, g) => n + g.commands.length, 0);
  json(res, 200, {
    ok: true,
    user,
    isOwner: user.id === config.ownerId,
    insecure: !!user.insecure,
    status: {
      version: VERSION,
      model: config.model,
      uptime: Math.floor((Date.now() - bootTime) / 1000),
      memories,
      commands: total,
    },
    groups,
  });
}

function handleStatus(req, res, user) {
  json(res, 200, {
    ok: true,
    version: VERSION,
    model: config.model,
    uptime: Math.floor((Date.now() - bootTime) / 1000),
    owner: user.id === config.ownerId,
    webappUrl: config.webappUrl,
    db: dbStats(),
  });
}

async function handleChat(req, res, user, memory, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const text = String(body.message || "").trim();
  if (!text) return json(res, 400, { ok: false, error: "empty_message" });

  const id = user.id;
  memory.push(id, text, "user");
  addMessage(id, "user", text);

  let system = CHAT_SYSTEM;
  const firstUser = store && store.data && store.data.firstUser;
  if (firstUser && firstUser.id === id) {
    system = buildChildSystem(firstUser);
  }
  const mem = await buildContext(id, text).catch(() => null);
  if (mem && (mem.facts || mem.summary)) {
    const extra = [];
    if (mem.summary) extra.push(`Ongoing conversation summary:\n${mem.summary}`);
    if (mem.facts) extra.push(`Long-term memories about this person:\n${mem.facts}`);
    system = system + "\n\n" + extra.join("\n\n");
  }
  const history = memory.get(id).slice(0, -1);

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
  });
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  try {
    let answer = "";
    for await (const delta of chatStream(text, history, system)) {
      if (!delta) continue;
      answer += delta;
      send({ delta });
    }
    if (!answer) answer = "متوجه نشدم؛ دوباره بگو.";
    memory.push(id, answer, "assistant");
    addMessage(id, "assistant", answer);
    void extractFacts(id, [text, answer]);
    send({ done: true });
  } catch (err) {
    if (err.message === "NO_GEMINI_KEY") {
      send({ error: "no_key" });
    } else {
      console.error("webapp chat error:", err);
      send({ error: "server" });
    }
  } finally {
    res.end();
  }
}

function handleMemories(req, res, user) {
  const memories = listMemories(user.id, 50);
  json(res, 200, { ok: true, count: memories.length, memories });
}

function handleMemoryDelete(req, res, user) {
  const url = new URL(req.url, "http://localhost");
  const id = Number(url.searchParams.get("id") || 0);
  if (!id) return json(res, 400, { ok: false, error: "bad_id" });
  const removed = forgetMemoryById(user.id, id);
  json(res, 200, { ok: true, removed });
}

export function startWebApp({ memory, store }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      const user = authUser(req);
      if (!user) return json(res, 401, { ok: false, error: "unauthorized" });
      switch (true) {
        case pathname === "/api/init":
          return handleInit(req, res, user);
        case pathname === "/api/status":
          return handleStatus(req, res, user);
        case pathname === "/api/chat" && req.method === "POST":
          return handleChat(req, res, user, memory, store);
        case pathname === "/api/memories" && req.method === "GET":
          return handleMemories(req, res, user);
        case pathname === "/api/memories" && req.method === "DELETE":
          return handleMemoryDelete(req, res, user);
        default:
          return notFound(res);
      }
    }

    return serveStatic(req, res, pathname);
  });

  server.listen(config.webappPort, config.webappHost, () => {
    console.log(`WebApp (Mini App) running at http://${config.webappHost}:${config.webappPort}`);
    console.log(`WebApp URL for Telegram: ${config.webappUrl}`);
  });

  server.on("error", (err) => {
    console.error("WebApp server error:", err.message);
  });

  return server;
}
