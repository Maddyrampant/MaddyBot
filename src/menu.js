import { InlineKeyboard, Keyboard } from "grammy";
import config from "./config.js";
import {
  allGroups,
  commandsByGroup,
  registry,
  groupLabel,
  cmdDesc,
  escapeHtml,
} from "./utils.js";

const PER_PAGE = 6;
const COLS = 2;

export const MAIN_TEXT = "<b>🤖 منوی مادی‌بات</b>\nدسته یا گزینه‌ای را انتخاب کنید.";

export function replyKeyboard() {
  return new Keyboard().text("🧭 منو").text("🤖 دستیار").text("🌐 وباپ").resized();
}

function groupsWithCommands() {
  return allGroups().filter(([key]) => commandsByGroup(key).length);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function mainMenu(page = 0) {
  const groups = groupsWithCommands();
  const pages = Math.max(1, Math.ceil(groups.length / PER_PAGE));
  const p = clamp(Number(page) || 0, 0, pages - 1);
  const kb = new InlineKeyboard();
  kb.webApp("🌐 وباپ مادی‌بات", config.webappUrl).row();
  const slice = groups.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
  for (let i = 0; i < slice.length; i += COLS) {
    kb.text(groupLabel(slice[i][0]), "m:grp:" + slice[i][0]);
    if (slice[i + 1]) kb.text(groupLabel(slice[i + 1][0]), "m:grp:" + slice[i + 1][0]);
    kb.row();
  }
  if (pages > 1) {
    if (p > 0) kb.text("⬅️ قبلی", `m:main:p:${p - 1}`);
    kb.text(`${p + 1}/${pages}`, "m:noop");
    if (p < pages - 1) kb.text("بعدی ➡️", `m:main:p:${p + 1}`);
    kb.row();
  }
  kb.text("💬 گفتگو", "m:grp:ai").text("ℹ️ درباره", "m:about");
  return kb;
}

export function groupMenu(key, page = 0) {
  const cmds = commandsByGroup(key);
  const pages = Math.max(1, Math.ceil(cmds.length / PER_PAGE));
  const p = clamp(Number(page) || 0, 0, pages - 1);
  const kb = new InlineKeyboard();
  kb.text("◀️ برگشت به منو", "m:home").row();
  const slice = cmds.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
  for (let i = 0; i < slice.length; i += COLS) {
    kb.text("/" + slice[i].name, "m:cmd:" + slice[i].name);
    if (slice[i + 1]) kb.text("/" + slice[i + 1].name, "m:cmd:" + slice[i + 1].name);
    kb.row();
  }
  if (pages > 1) {
    if (p > 0) kb.text("⬅️ قبلی", `m:grp:${key}:p:${p - 1}`);
    kb.text(`${p + 1}/${pages}`, "m:noop");
    if (p < pages - 1) kb.text("بعدی ➡️", `m:grp:${key}:p:${p + 1}`);
    kb.row();
  }
  kb.text("🏠 منوی اصلی", "m:home").text("🌐 وباپ", "m:app");
  return kb;
}

export function cmdView(name) {
  const meta = registry[name];
  if (!meta) return null;
  const text =
    `/<b>${escapeHtml(meta.name)}</b>` +
    `${meta.usage ? " " + escapeHtml(meta.usage) : ""}\n` +
    `${cmdDesc(name) || meta.desc}\n` +
    `گروه: ${groupLabel(meta.group)}`;
  const kb = new InlineKeyboard()
    .text("◀️ برگشت به " + groupLabel(meta.group), "m:grp:" + meta.group)
    .row()
    .text("🏠 منوی اصلی", "m:home");
  return { text, kb };
}

function aboutKb() {
  return new InlineKeyboard()
    .text("🌐 وباپ مادی‌بات", "m:app")
    .row()
    .text("🏠 منوی اصلی", "m:home");
}

function aboutText() {
  return (
    "<b>مادی‌بات 🤖</b>\n" +
    "دستیار تلگرامی چندمنظوره با بیش از ۱۰۰ فرمان: گفتگو، ترجمه، ابزار متن، ریاضی، " +
    "آب‌وهوا، QR، بازی، یادآوری، مدیریت گروه و موارد دیگر.\n" +
    "نسخه: 1.0.0\n" +
    "با دکمه‌ها یا /commands همه‌چیز را بگرد."
  );
}

export function showMain(ctx) {
  return showMenu(ctx, mainMenu(0), MAIN_TEXT);
}

export async function showMenu(ctx, kb, text) {
  try {
    await ctx.answerCallbackQuery();
  } catch {}
  try {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  } catch {
    try {
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
    } catch {}
  }
}

export function registerMenu(bot, deps) {
  const { sendWebapp } = deps;

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("m:")) return next();
    const parts = data.split(":");
    const action = parts[1];
    try {
      switch (action) {
        case "home":
          return showMain(ctx);
        case "main":
          return showMenu(ctx, mainMenu(Number(parts[3] || parts[2]) || 0), MAIN_TEXT);
        case "grp": {
          const key = parts[2];
          const page = parts[3] === "p" ? Number(parts[4] || 0) : 0;
          const text = `<b>${groupLabel(key)}</b>\nدستوری را انتخاب کنید.`;
          return showMenu(ctx, groupMenu(key, page), text);
        }
        case "cmd": {
          const view = cmdView(parts[2]);
          if (!view) return ctx.answerCallbackQuery({ text: "فرمان پیدا نشد." });
          return showMenu(ctx, view.kb, view.text);
        }
        case "app":
          return sendWebapp(ctx);
        case "about":
          return showMenu(ctx, aboutKb(), aboutText());
        case "noop":
          return ctx.answerCallbackQuery();
        default:
          return ctx.answerCallbackQuery({ text: "نامشخص." });
      }
    } catch (err) {
      console.error("menu error:", err);
      try {
        await ctx.answerCallbackQuery({ text: "خطا" });
      } catch {}
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();
    const t = (ctx.message.text || "").trim();
    if (t === "🧭 منو") {
      return ctx.reply(MAIN_TEXT, { parse_mode: "HTML", reply_markup: mainMenu(0) });
    }
    if (t === "🤖 دستیار") {
      return ctx.reply(`<b>${groupLabel("ai")}</b>\nدستوری را انتخاب کنید.`, {
        parse_mode: "HTML",
        reply_markup: groupMenu("ai", 0),
      });
    }
    if (t === "🌐 وباپ") {
      return sendWebapp(ctx);
    }
    return next();
  });
}
