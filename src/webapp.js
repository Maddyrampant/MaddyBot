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
import { allGroups, commandsByGroup, groupLabel, cmdDesc, todayStr, uid } from "./utils.js";
import { GAMES, gameByKey } from "./gamecatalog.js";
import { processLocal, processAI, persistImage, cleanupFile, extFromMime } from "./image.js";
import { buildChildSystem } from "./commands/onboarding.js";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC_DIR = join(ROOT, "public");
const GAMES_DIR = join(ROOT, "games");
const VERSION = "1.1.0";
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

function groupsMeta(isOwner = true) {
  return allGroups()
    .map(([key]) => ({
      key,
      label: groupLabel(key),
      commands: commandsByGroup(key, isOwner).map((c) => ({
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

function gameSig(userId) {
  return createHmac("sha256", config.botToken).update(String(userId)).digest("hex");
}

function authGameRequest(req) {
  const url = new URL(req.url, "http://localhost");
  const userId = url.searchParams.get("user");
  const sig = url.searchParams.get("sig");
  if (userId && sig) {
    const expected = gameSig(userId);
    if (sig.length === expected.length && safeEqualHex(sig, expected)) {
      return {
        id: Number(userId),
        first_name: url.searchParams.get("name") || "",
        username: "",
        via: "game",
      };
    }
    return null;
  }
  const init = req.headers["x-telegram-init-data"];
  if (init) return validateInitData(init);
  return null;
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

function serveFrom(rootDir, req, res, pathname) {
  let p = pathname === "/" || pathname === "" ? "/index.html" : pathname;
  const file = normalize(join(rootDir, p));
  if (!file.startsWith(rootDir) || !existsSync(file) || statSync(file).isDirectory()) {
    return notFound(res);
  }
  res.writeHead(200, {
    "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(file).pipe(res);
}

function serveStatic(req, res, pathname) {
  return serveFrom(PUBLIC_DIR, req, res, pathname);
}

function serveGame(req, res, pathname) {
  return serveFrom(GAMES_DIR, req, res, pathname.replace(/^\/games/, "") || "/");
}

function handleInit(req, res, user) {
  const memories = countMemories(user.id);
  const isOwner = user.id === config.ownerId;
  const groups = groupsMeta(isOwner);
  const total = groups.reduce((n, g) => n + g.commands.length, 0);
  json(res, 200, {
    ok: true,
    user,
    isOwner,
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

async function handleGameScore(req, res, user, store) {
  if (!store) return json(res, 500, { ok: false, error: "no_store" });
  let body;
  try {
    body = JSON.parse(await readBody(req, 10_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const game = gameByKey(String(body.game || ""));
  if (!game) return json(res, 400, { ok: false, error: "unknown_game" });
  const score = Math.floor(Number(body.score));
  if (!Number.isFinite(score) || score < 0 || score > 1e9) {
    return json(res, 400, { ok: false, error: "bad_score" });
  }
  const name = user.first_name || user.username || "";
  const saved = store.addGameScore(game.key, user.id, score, name);
  json(res, 200, {
    ok: true,
    game: game.key,
    isNewBest: saved.isNewBest,
    best: Math.max(saved.best, score),
    top: store.topGameScores(game.key, 10),
  });
}

function handleGameTop(req, res, store) {
  const url = new URL(req.url, "http://localhost");
  const game = gameByKey(String(url.searchParams.get("game") || ""));
  if (!game) return json(res, 400, { ok: false, error: "unknown_game" });
  json(res, 200, {
    ok: true,
    game: game.key,
    top: store ? store.topGameScores(game.key, 10) : [],
  });
}

/* ---------------- data endpoints ---------------- */

function handleGames(req, res, user, store) {
  const games = GAMES.map((g) => ({
    key: g.key,
    title: g.title,
    emoji: g.emoji,
    desc: g.desc,
    best: g.best,
    url: `/games/${g.file}?user=${user.id}&sig=${gameSig(user.id)}`,
    userBest: store ? store.bestGameScore(g.key, user.id) : 0,
    top: store ? store.topGameScores(g.key, 10) : [],
  }));
  json(res, 200, { ok: true, games });
}

/* ---- todos ---- */

function handleTodos(req, res, user, store) {
  const u = store.getUser(user.id);
  json(res, 200, { ok: true, todos: u.todos || [] });
}

async function handleTodosWrite(req, res, user, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 100_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const u = store.getUser(user.id);
  if (body.action === "toggle") {
    const t = (u.todos || []).find((x) => x.id === body.id);
    if (!t) return json(res, 400, { ok: false, error: "not_found" });
    t.done = !t.done;
  } else if (body.action === "del") {
    u.todos = (u.todos || []).filter((x) => x.id !== body.id);
  } else {
    const text = String(body.text || "").trim();
    if (!text) return json(res, 400, { ok: false, error: "empty_text" });
    u.todos = u.todos || [];
    u.todos.push({ id: uid(), text, done: false, priority: body.priority || null, deadline: body.deadline || null, createdAt: Date.now() });
  }
  store.save();
  json(res, 200, { ok: true, todos: u.todos || [] });
}

/* ---- notes ---- */

function handleNotes(req, res, user, store) {
  const u = store.getUser(user.id);
  json(res, 200, { ok: true, notes: u.notes || [] });
}

async function handleNotesWrite(req, res, user, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 100_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const u = store.getUser(user.id);
  if (body.action === "del") {
    u.notes = (u.notes || []).filter((x) => x.id !== body.id);
  } else {
    const text = String(body.text || "").trim();
    if (!text) return json(res, 400, { ok: false, error: "empty_text" });
    u.notes = u.notes || [];
    u.notes.push({ id: uid(), text, createdAt: Date.now() });
  }
  store.save();
  json(res, 200, { ok: true, notes: u.notes || [] });
}

/* ---- reminders ---- */

function handleReminders(req, res, user, store) {
  const u = store.getUser(user.id);
  const list = (u.reminders || [])
    .map((r) => ({ id: r.id, text: r.text, at: r.at, remainingMin: Math.max(0, Math.round((r.at - Date.now()) / 60000)) }))
    .sort((a, b) => a.at - b.at);
  json(res, 200, { ok: true, reminders: list });
}

async function handleRemindersWrite(req, res, user, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 100_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const u = store.getUser(user.id);
  if (body.action === "del") {
    u.reminders = (u.reminders || []).filter((x) => x.id !== body.id);
  } else {
    const text = String(body.text || "").trim();
    const minutes = Math.floor(Number(body.minutes));
    if (!text || !Number.isFinite(minutes) || minutes < 1) {
      return json(res, 400, { ok: false, error: "bad_reminder" });
    }
    u.reminders = u.reminders || [];
    u.reminders.push({
      id: uid(),
      at: Date.now() + minutes * 60000,
      text,
      chatId: u.lastChatId || 0,
    });
  }
  store.save();
  handleReminders(req, res, user, store);
}

/* ---- budget & expenses ---- */

function monthSpent(expenses) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  return (expenses || []).filter((e) => e.date >= monthStart).reduce((s, e) => s + e.amount, 0);
}

function handleBudget(req, res, user, store) {
  const u = store.getUser(user.id);
  const spent = monthSpent(u.expenses);
  json(res, 200, { ok: true, budget: u.budget || 0, spent, left: (u.budget || 0) - spent });
}

async function handleBudgetWrite(req, res, user, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 100_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) return json(res, 400, { ok: false, error: "bad_amount" });
  const u = store.getUser(user.id);
  u.budget = amount;
  store.save();
  handleBudget(req, res, user, store);
}

function handleExpenses(req, res, user, store) {
  const u = store.getUser(user.id);
  const list = [...(u.expenses || [])].sort((a, b) => b.date - a.date);
  json(res, 200, {
    ok: true,
    expenses: list,
    total: list.reduce((s, e) => s + e.amount, 0),
  });
}

async function handleExpensesWrite(req, res, user, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 100_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const u = store.getUser(user.id);
  if (body.action === "del") {
    u.expenses = (u.expenses || []).filter((x) => x.id !== body.id);
  } else {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { ok: false, error: "bad_amount" });
    u.expenses = u.expenses || [];
    u.expenses.push({
      id: uid(),
      amount,
      category: String(body.category || "other").toLowerCase(),
      note: String(body.note || "").trim(),
      date: Date.now(),
    });
  }
  store.save();
  handleExpenses(req, res, user, store);
}

/* ---- water ---- */

function handleWater(req, res, user, store) {
  const u = store.getUser(user.id);
  const today = todayStr();
  if (u.water.date !== today) {
    u.water = { date: today, ml: 0 };
    store.save();
  }
  json(res, 200, { ok: true, water: u.water, goal: 2500 });
}

async function handleWaterWrite(req, res, user, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 100_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const u = store.getUser(user.id);
  const today = todayStr();
  if (u.water.date !== today) u.water = { date: today, ml: 0 };
  const ml = Math.floor(Number(body.ml));
  if (body.action === "reset") u.water.ml = 0;
  else if (Number.isFinite(ml) && ml > 0) u.water.ml += ml;
  else return json(res, 400, { ok: false, error: "bad_ml" });
  store.save();
  json(res, 200, { ok: true, water: u.water, goal: 2500 });
}

/* ---- mood ---- */

function handleMood(req, res, user, store) {
  const u = store.getUser(user.id);
  json(res, 200, { ok: true, moodLog: u.moodLog || [] });
}

async function handleMoodWrite(req, res, user, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 100_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const u = store.getUser(user.id);
  const mood = Math.floor(Number(body.mood));
  if (mood < 1 || mood > 5) return json(res, 400, { ok: false, error: "bad_mood" });
  const date = todayStr();
  const entry = { date, mood, note: String(body.note || "").trim() };
  const idx = (u.moodLog || []).findIndex((e) => e.date === date);
  if (idx >= 0) u.moodLog[idx] = entry;
  else {
    u.moodLog = u.moodLog || [];
    u.moodLog.push(entry);
  }
  store.save();
  json(res, 200, { ok: true, moodLog: u.moodLog || [] });
}

/* ---- habits ---- */

function streak(dates) {
  let n = 0;
  const set = new Set(dates || []);
  const d = new Date();
  while (true) {
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if (!set.has(key)) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function handleHabits(req, res, user, store) {
  const u = store.getUser(user.id);
  json(res, 200, { ok: true, habits: (u.habits || []).map((h) => ({ ...h, streak: streak(h.dates) })) });
}

async function handleHabitsWrite(req, res, user, store) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 100_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const u = store.getUser(user.id);
  const today = todayStr();
  if (body.action === "toggle") {
    const h = (u.habits || []).find((x) => x.id === body.id);
    if (!h) return json(res, 400, { ok: false, error: "not_found" });
    const i = (h.dates || []).indexOf(today);
    if (i >= 0) h.dates.splice(i, 1);
    else h.dates = h.dates || [], h.dates.push(today);
  } else if (body.action === "del") {
    u.habits = (u.habits || []).filter((x) => x.id !== body.id);
  } else {
    const name = String(body.name || "").trim();
    if (!name) return json(res, 400, { ok: false, error: "empty_name" });
    if ((u.habits || []).some((h) => h.name.toLowerCase() === name.toLowerCase())) {
      return json(res, 400, { ok: false, error: "exists" });
    }
    u.habits = u.habits || [];
    u.habits.push({ id: uid(), name, dates: [] });
  }
  store.save();
  handleHabits(req, res, user, store);
}

/* ---- image endpoints ---- */

async function imageBase64ToFile(body) {
  const b64 = String(body.imageBase64 || "");
  if (!b64) return null;
  const mime = String(body.mime || "image/jpeg");
  return persistImage(Buffer.from(b64, "base64"), extFromMime(mime));
}

async function handleImageProcess(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 30_000_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  let input = null;
  try {
    input = await imageBase64ToFile(body);
    if (!input) return json(res, 400, { ok: false, error: "no_image" });
    const out = await processLocal(input, {
      action: String(body.action || "compress"),
      params: body.params || {},
    });
    json(res, 200, {
      ok: true,
      mime: out.mime,
      ext: out.ext,
      meta: out.meta,
      base64: out.buffer.toString("base64"),
    });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  } finally {
    await cleanupFile(input);
  }
}

async function handleImageAI(req, res, action) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 30_000_000));
  } catch {
    return json(res, 400, { ok: false, error: "bad_body" });
  }
  const a = String(body.action || action || "describe");
  let input = null;
  try {
    if (a !== "imagine") {
      input = await imageBase64ToFile(body);
      if (!input) return json(res, 400, { ok: false, error: "no_image" });
    }
    const out = await processAI(input, { action: a, prompt: body.prompt });
    if (out.kind === "text") {
      return json(res, 200, { ok: true, kind: "text", text: out.text });
    }
    json(res, 200, {
      ok: true,
      kind: "image",
      mime: out.mime,
      ext: out.ext,
      text: out.text || "",
      base64: out.buffer.toString("base64"),
    });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  } finally {
    await cleanupFile(input);
  }
}

export function startWebApp({ memory, store }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      const isGameAuth = pathname === "/api/game/score" || pathname === "/api/game/top";
      const user = isGameAuth ? authGameRequest(req) : authUser(req);
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
        case pathname === "/api/game/score" && req.method === "POST":
          return handleGameScore(req, res, user, store);
        case pathname === "/api/game/top" && req.method === "GET":
          return handleGameTop(req, res, store);
        case pathname === "/api/games" && req.method === "GET":
          return handleGames(req, res, user, store);
        case pathname === "/api/todos" && req.method === "GET":
          return handleTodos(req, res, user, store);
        case pathname === "/api/todos" && req.method === "POST":
          return handleTodosWrite(req, res, user, store);
        case pathname === "/api/notes" && req.method === "GET":
          return handleNotes(req, res, user, store);
        case pathname === "/api/notes" && req.method === "POST":
          return handleNotesWrite(req, res, user, store);
        case pathname === "/api/reminders" && req.method === "GET":
          return handleReminders(req, res, user, store);
        case pathname === "/api/reminders" && req.method === "POST":
          return handleRemindersWrite(req, res, user, store);
        case pathname === "/api/budget" && req.method === "GET":
          return handleBudget(req, res, user, store);
        case pathname === "/api/budget" && req.method === "POST":
          return handleBudgetWrite(req, res, user, store);
        case pathname === "/api/expenses" && req.method === "GET":
          return handleExpenses(req, res, user, store);
        case pathname === "/api/expenses" && req.method === "POST":
          return handleExpensesWrite(req, res, user, store);
        case pathname === "/api/water" && req.method === "GET":
          return handleWater(req, res, user, store);
        case pathname === "/api/water" && req.method === "POST":
          return handleWaterWrite(req, res, user, store);
        case pathname === "/api/mood" && req.method === "GET":
          return handleMood(req, res, user, store);
        case pathname === "/api/mood" && req.method === "POST":
          return handleMoodWrite(req, res, user, store);
        case pathname === "/api/habits" && req.method === "GET":
          return handleHabits(req, res, user, store);
        case pathname === "/api/habits" && req.method === "POST":
          return handleHabitsWrite(req, res, user, store);
        case pathname === "/api/image" && req.method === "POST":
          return handleImageProcess(req, res);
        case pathname === "/api/image/imagine" && req.method === "POST":
          return handleImageAI(req, res, "imagine");
        case pathname === "/api/image/ai" && req.method === "POST":
          return handleImageAI(req, res, "describe");
        default:
          return notFound(res);
      }
    }

    if (pathname === "/games" || pathname.startsWith("/games/")) {
      return serveGame(req, res, pathname);
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
