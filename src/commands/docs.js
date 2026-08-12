import { InlineKeyboard } from "grammy";
import { reg, replyLong, setupHint } from "../utils.js";
import { extractDocText } from "../media.js";

const pendingDocs = new Map();
const DOC_RE = /\.(pdf|txt|docx?|md)$/i;
const DOC_MIME =
  /^(application\/pdf|text\/|application\/vnd\.openxmlformats-officedocument\.wordprocessingml|application\/msword)/i;

function friendly(err) {
  const m = String(err && err.message ? err.message : err);
  if (m === "NO_GEMINI_KEY") return setupHint();
  if (m === "NO_TEXT") return "📄 متنی در این فایل پیدا نکردم (شاید اسکن تصویری است و متن خوانا ندارد).";
  if (m === "EMPTY_RESPONSE") return "🤖 پاسخی دریافت نشد؛ دوباره تلاش کن.";
  if (m === "input_too_large") return "📦 فایل خیلی بزرگ است (حداکثر ۲۰ مگابایت).";
  return "⚠️ خطا در استخراج متن:\n" + m.slice(0, 300);
}

export default function register(bot) {
  reg("extract", { usage: "<reply to a file>", desc: "Extract text from a PDF, Word or txt file", group: "knowledge" });

  async function extractFrom(ctx, doc) {
    await ctx.replyWithChatAction("typing");
    try {
      const text = await extractDocText(ctx, doc.file_id, doc.file_name || "", doc.mime_type || "");
      const head = `📄 متن استخراج‌شده از «${doc.file_name || "فایل"}»:\n\n`;
      await replyLong(head + text)(ctx);
    } catch (err) {
      await ctx.reply(friendly(err));
    }
  }

  bot.command("extract", async (ctx) => {
    const doc = ctx.message && ctx.message.reply_to_message && ctx.message.reply_to_message.document;
    if (!doc) return ctx.reply("روی یک فایل PDF یا Word ریپلای کن (فایل متنی .txt هم قبول است).");
    await extractFrom(ctx, doc);
  });

  bot.on("message:document", async (ctx, next) => {
    const doc = ctx.message.document;
    const name = (doc && doc.file_name) || "";
    if (!doc || (!DOC_RE.test(name) && !DOC_MIME.test(doc.mime_type || ""))) return next();
    const id = ctx.from ? ctx.from.id : null;
    if (id) pendingDocs.set(String(id), { fileId: doc.file_id, name, mime: doc.mime_type || "" });
    const kb = new InlineKeyboard().text("📄 استخراج متن", "doc:extract").text("✖️", "doc:close");
    await ctx.reply(`📎 فایل «${name}» را گرفتم.`, { reply_markup: kb });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data || "";
    if (!data.startsWith("doc:")) return next();
    await ctx.answerCallbackQuery().catch(() => {});
    const id = ctx.from ? ctx.from.id : null;
    if (data === "doc:close") {
      if (id) pendingDocs.delete(String(id));
      return ctx.deleteMessage().catch(() => {});
    }
    const pend = id ? pendingDocs.get(String(id)) : null;
    if (!pend) return ctx.reply("فایل منقضی شده؛ دوباره آن را بفرست.");
    pendingDocs.delete(String(id));
    await ctx.deleteMessage().catch(() => {});
    await extractFrom(ctx, { file_id: pend.fileId, file_name: pend.name, mime_type: pend.mime });
  });
}
