import { reg, argText, replyLong, setupHint } from "../utils.js";
import config from "../config.js";
import { runAgent } from "../agent.js";
import { rememberToolFor, registry as toolRegistry } from "../tools.js";
import { exec } from "child_process";
import { promisify } from "util";
import { parse as parseHTML } from "node-html-parser";

const execAsync = promisify(exec);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const SAFE_TOOLS = ["web_fetch", "web_search", "browse", "api_call", "remember"];

function userIdFrom(ctx) {
  return ctx.from ? ctx.from.id : ctx.chat.id;
}

function isOwner(ctx) {
  return Boolean(config.ownerId && ctx.from && ctx.from.id === config.ownerId);
}

function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeout);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

export default function register(bot) {
  reg("agent", { usage: "<task>", desc: "Autonomous agent that can search, browse and call APIs", group: "dev" });
  reg("run", { usage: "<command>", desc: "Run a shell command (owner only)", group: "dev" });
  reg("api", { usage: "<method> <url> [body]", desc: "Call an API (owner for POST/PUT/PATCH/DELETE)", group: "dev" });
  reg("search", { usage: "<query>", desc: "Search the web", group: "web" });
  reg("fetch", { usage: "<url>", desc: "Read a web page as text", group: "web" });
  reg("browse", { usage: "<url>", desc: "Open a page in a browser and read its text", group: "web" });

  bot.command("agent", async (ctx) => {
    const task = argText(ctx);
    if (!task) return ctx.reply("Usage: /agent <task>\nExample: /agent what is the price of bitcoin right now?");
    await ctx.replyWithChatAction("typing");
    try {
      const allowTools = isOwner(ctx) ? null : SAFE_TOOLS;
      const extraTools = [rememberToolFor(userIdFrom(ctx))];
      const result = await runAgent(task, { userId: userIdFrom(ctx), allowTools, extraTools });
      await replyLong(result.text)(ctx);
    } catch (err) {
      if (err.message === "NO_GEMINI_KEY") return ctx.reply(setupHint());
      if (err.message === "NO_TOOLS") return ctx.reply("Agent tools are not configured yet.");
      console.error("agent error:", err);
      await ctx.reply("Agent failed: " + (err.message || err));
    }
  });

  bot.command("run", async (ctx) => {
    if (!isOwner(ctx)) return ctx.reply("This command is restricted to the bot owner.");
    const command = argText(ctx);
    if (!command) return ctx.reply("Usage: /run <command>");
    await ctx.replyWithChatAction("typing");
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      await replyLong((stdout + (stderr ? "\n[stderr] " + stderr : "")).trim() || "(no output)")(ctx);
    } catch (err) {
      await ctx.reply("Command failed:\n" + ((err.stdout || "") + "\n" + (err.stderr || "")).trim().slice(0, 3000) || err.message);
    }
  });

  bot.command("api", async (ctx) => {
    const args = argText(ctx).split(/\s+/);
    const method = (args.shift() || "GET").toUpperCase();
    const url = args.shift();
    if (!url) return ctx.reply("Usage: /api <method> <url> [body]\nExample: /api GET https://api.github.com/zen");
    if (!/^https?:\/\//i.test(url)) return ctx.reply("URL must start with http(s)://");
    const stateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    if (stateChanging && !isOwner(ctx)) return ctx.reply("Only the owner can use " + method + ".");
    const body = args.join(" ");
    await ctx.replyWithChatAction("typing");
    try {
      const res = await fetchWithTimeout(url, {
        method,
        headers: { "user-agent": UA },
        body: ["POST", "PUT", "PATCH"].includes(method) && body ? body : undefined,
      });
      const buf = Buffer.from(await res.arrayBuffer()).slice(0, 100_000);
      let out = buf.toString("utf8");
      const ct = res.headers.get("content-type") || "";
      if (/json/i.test(ct)) {
        try {
          out = JSON.stringify(JSON.parse(out));
        } catch {}
      }
      await replyLong(`HTTP ${res.status}\n\n${out}`)(ctx);
    } catch (err) {
      await ctx.reply("Request failed: " + (err.message || err));
    }
  });

  bot.command("search", async (ctx) => {
    const query = argText(ctx);
    if (!query) return ctx.reply("Usage: /search <query>");
    await ctx.replyWithChatAction("typing");
    try {
      const res = await fetchWithTimeout("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
        headers: { "user-agent": UA },
      });
      const root = parseHTML(await res.text());
      const results = [];
      for (const el of root.querySelectorAll(".result").slice(0, 6)) {
        const a = el.querySelector(".result__a");
        const sn = el.querySelector(".result__snippet");
        if (!a) continue;
        results.push(`<a href="${a.getAttribute("href")}">${a.textContent.trim()}</a>\n${sn ? sn.textContent.trim() : ""}`);
      }
      if (!results.length) return ctx.reply("No results.");
      const parts = results.map((r, i) => `<b>${i + 1}.</b> ${r}`).join("\n\n");
      await replyLong(parts, { parse_mode: "HTML", disable_web_page_preview: true })(ctx);
    } catch (err) {
      await ctx.reply("Search failed: " + (err.message || err));
    }
  });

  bot.command("fetch", async (ctx) => {
    const url = argText(ctx);
    if (!url) return ctx.reply("Usage: /fetch <url>");
    if (!/^https?:\/\//i.test(url)) return ctx.reply("URL must start with http(s)://");
    await ctx.replyWithChatAction("typing");
    try {
      const res = await fetchWithTimeout(url, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer()).slice(0, 1_500_000);
      const text = buf.toString("utf8");
      const ct = res.headers.get("content-type") || "";
      let out;
      if (/html/i.test(ct) || /<html|<!doctype/i.test(text.slice(0, 500))) {
        const root = parseHTML(text);
        out = (root.querySelector("body") || root).textContent.replace(/\s+/g, " ").trim();
      } else {
        out = text;
      }
      if (!out) return ctx.reply("Page appears to be empty.");
      await replyLong(out.slice(0, 15000))(ctx);
    } catch (err) {
      await ctx.reply("Fetch failed: " + (err.message || err));
    }
  });

  bot.command("browse", async (ctx) => {
    const url = argText(ctx);
    if (!url) return ctx.reply("Usage: /browse <url>");
    if (!/^https?:\/\//i.test(url)) return ctx.reply("URL must start with http(s)://");
    await ctx.replyWithChatAction("typing");
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.browserTimeout });
        await page.waitForTimeout(1500);
        const text = await page.evaluate(() => (document.body ? document.body.innerText : ""));
        await replyLong((text.replace(/\s+/g, " ").trim().slice(0, 15000) || "(empty page)"))(ctx);
      } finally {
        await page.close().catch(() => {});
        await browser.close().catch(() => {});
      }
    } catch (err) {
      await ctx.reply("Browse failed: " + (err.message || err));
    }
  });

  return { toolCount: toolRegistry.size };
}
