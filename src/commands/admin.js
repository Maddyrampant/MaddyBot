import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { statfsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InlineKeyboard } from "grammy";
import { reg, argText, isOwnerCtx, clamp } from "../utils.js";
import config from "../config.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const execAsync = promisify(exec);

export const ADMIN_TEXT = "🛠️ پنل ادمین\nمدیریت سیستم مادی‌بات.";

export function adminKb() {
  return new InlineKeyboard()
    .text("💻 وضعیت سیستم", "adm:sys")
    .text("📜 لاگ ربات", "adm:log")
    .row()
    .text("🔄 ریاستارت ربات", "adm:restart")
    .text("🏠 منوی اصلی", "m:home");
}

function fmtBytes(n) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function fmtUptime(s) {
  s = Math.floor(s);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d} روز`);
  if (h) parts.push(`${h} ساعت`);
  if (m) parts.push(`${m} دقیقه`);
  parts.push(`${sec} ثانیه`);
  return parts.join(" ");
}

function cpuLoadPct() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  return Math.round((1 - idle / total) * 100);
}

function diskUsage() {
  const drives = [];
  for (let code = 67; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      const s = statfsSync(root);
      if (s.blocks) {
        drives.push({
          name: `${String.fromCharCode(code)}:`,
          used: (s.blocks - s.bfree) * s.bsize,
          free: s.bfree * s.bsize,
        });
      }
    } catch {}
  }
  return drives;
}

export async function sysInfoText() {
  const mem = os.totalmem();
  const used = mem - os.freemem();
  const pct = Math.round((used / mem) * 100);
  const lines = [
    `🖥️ میزبان: ${os.hostname()} (${os.platform()} ${os.release()})`,
    `⏱️ آپتایم سیستم: ${fmtUptime(os.uptime())}`,
    `⚙️ CPU: ${(os.cpus()[0].model || "?").trim()} × ${os.cpus().length} هسته — بار: ~${cpuLoadPct()}%`,
    `🧠 رم: ${fmtBytes(used)} از ${fmtBytes(mem)} (${pct}٪)`,
    ...diskUsage().map((d) => `💾 دیسک ${d.name}: ${fmtBytes(d.used)} از ${fmtBytes(d.used + d.free)}`),
    ``,
    `🤖 Node ${process.version} — ربات ${fmtUptime(process.uptime())}`,
    `🌐 وباپ: ${config.webappUrl}`,
  ];
  return lines.join("\n");
}

async function tailFile(file, n) {
  try {
    const t = await readFile(file, "utf8");
    return t.split(/\r?\n/).filter(Boolean).slice(-n).join("\n");
  } catch {
    return "(فایلی نیست)";
  }
}

export async function logTailText(n) {
  const botLog = await tailFile(path.join(ROOT, "bot.log"), n);
  const errLog = await tailFile(path.join(ROOT, "bot.err.log"), n);
  return `📜 bot.log (آخرین ${n} خط):\n<pre>${botLog.slice(0, 3500)}</pre>\n\n⚠️ bot.err.log:\n<pre>${errLog.slice(0, 1500)}</pre>`;
}

function restartBot() {
  setTimeout(() => {
    execAsync("pm2 restart maddybot").catch(() => {});
  }, 1200);
}

const DENY = "دسترسی فقط برای ادمین اصلی است.";

export default function register(bot) {
  reg("admin", { desc: "Admin system panel (owner only)", group: "admin", ownerOnly: true });
  reg("sys", { desc: "System status: CPU, RAM, disk (owner only)", group: "admin", ownerOnly: true });
  reg("log", { usage: "[n]", desc: "Last lines of the bot log (owner only)", group: "admin", ownerOnly: true });
  reg("restart", { desc: "Restart the bot (owner only)", group: "admin", ownerOnly: true });

  bot.command("admin", async (ctx) => {
    if (!isOwnerCtx(ctx)) return ctx.reply(DENY);
    return ctx.reply(ADMIN_TEXT, { reply_markup: adminKb() });
  });

  bot.command("sys", async (ctx) => {
    if (!isOwnerCtx(ctx)) return ctx.reply(DENY);
    await ctx.replyWithChatAction("typing");
    return ctx.reply(await sysInfoText());
  });

  bot.command("log", async (ctx) => {
    if (!isOwnerCtx(ctx)) return ctx.reply(DENY);
    const n = clamp(parseInt(argText(ctx), 10) || 10, 1, 50);
    await ctx.replyWithChatAction("typing");
    return ctx.reply(await logTailText(n), { parse_mode: "HTML" });
  });

  bot.command("restart", async (ctx) => {
    if (!isOwnerCtx(ctx)) return ctx.reply(DENY);
    await ctx.reply("در حال ریاستارت ربات... 🔄");
    restartBot();
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("adm:")) return next();
    if (!isOwnerCtx(ctx)) return ctx.answerCallbackQuery({ text: DENY });

    const action = data.split(":")[1];
    if (action === "sys") {
      await ctx.answerCallbackQuery();
      return ctx.reply(await sysInfoText());
    }
    if (action === "log") {
      await ctx.answerCallbackQuery();
      return ctx.reply(await logTailText(10), { parse_mode: "HTML" });
    }
    if (action === "restart") {
      await ctx.answerCallbackQuery({ text: "در حال ریاستارت..." });
      restartBot();
      return;
    }
    return ctx.answerCallbackQuery();
  });
}
