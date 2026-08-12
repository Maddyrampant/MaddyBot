import { InputFile } from "grammy";
import { reg, argText, replyLong, setupHint } from "../utils.js";
import { chat, CHAT_SYSTEM } from "../ai.js";
import { addMessage, extractFacts, buildContext } from "../memory.js";
import { transcribeVoice, speak } from "../media.js";
import { redisStatus } from "../redis.js";

function friendly(err) {
  const m = String(err && err.message ? err.message : err);
  if (m === "NO_GEMINI_KEY") return setupHint();
  if (m === "EMPTY_RESPONSE") return "🤖 پاسخی دریافت نشد؛ دوباره تلاش کن.";
  if (m === "TTS_EMPTY") return "🔇 نتوانستم صدا بسازم؛ متن کوتاه‌تری امتحان کن.";
  if (m === "EMPTY_TEXT") return "متن خالی است.";
  if (/RESOURCE_EXHAUSTED|quota/i.test(m)) return "⏳ سهمیهٔ تولید صدا موقتاً پر شده؛ چند ثانیه بعد دوباره تلاش کن.";
  if (/too (large|long)/i.test(m)) return "📦 فایل صوتی خیلی بزرگ است؛ کوتاه‌ترش کن.";
  return "⚠️ خطا:\n" + m.slice(0, 300);
}

async function sendVoiceReply(ctx, answer) {
  const out = await speak(answer);
  const name = "maddy_voice." + (out.ext === "ogg" ? "ogg" : "mp3");
  if (out.ext === "ogg") {
    await ctx.replyWithVoice(new InputFile(out.buffer, name), { caption: "" });
  } else {
    await ctx.replyWithAudio(new InputFile(out.buffer, name));
  }
}

async function aiReply(ctx, text, { memory, store }) {
  const id = ctx.from.id;
  memory.push(id, text, "user");
  addMessage(id, "user", text);
  let system = CHAT_SYSTEM;
  const mem = await buildContext(id, text).catch(() => null);
  if (mem && (mem.facts || mem.summary)) {
    const extra = [];
    if (mem.summary) extra.push(`Ongoing conversation summary:\n${mem.summary}`);
    if (mem.facts) extra.push(`Long-term memories about this person:\n${mem.facts}`);
    system = system + "\n\n" + extra.join("\n\n");
  }
  const answer = await chat(text, memory.get(id).slice(0, -1), system);
  if (!answer) throw new Error("EMPTY_RESPONSE");
  memory.push(id, answer, "assistant");
  addMessage(id, "assistant", answer);
  void extractFacts(id, [text, answer]);
  if (store.getUser(id).voiceReply) {
    try {
      await ctx.replyWithChatAction("record_voice");
      await sendVoiceReply(ctx, answer);
    } catch (err) {
      await replyLong(answer + "\n\n(🔇 صداسازی در دسترس نبود؛ متن را فرستادم)")(ctx);
    }
  } else {
    await replyLong(answer)(ctx);
  }
}

export default function register(bot, deps) {
  reg("speak", { usage: "<text>", desc: "Send the text as a voice message (text-to-speech)", group: "ai" });
  reg("voice", { usage: "[on|off]", desc: "Toggle voice replies", group: "ai" });
  reg("phone", { usage: "", desc: "Status of broadcasting voices to your phone via Redis", group: "ai" });
  reg("transcribe", { usage: "<reply to a voice>", desc: "Transcribe a voice message to text", group: "ai" });

  bot.command("speak", async (ctx) => {
    const text = argText(ctx);
    if (!text) return ctx.reply("روش استفاده: /speak <متن>\nمثال: /speak سلام، خوبی؟");
    await ctx.replyWithChatAction("record_voice");
    try {
      await sendVoiceReply(ctx, text);
    } catch (err) {
      await ctx.reply(friendly(err));
    }
  });

  bot.command("voice", async (ctx) => {
    const id = ctx.from ? ctx.from.id : null;
    if (!id) return ctx.reply("لطفاً از داخل تلگرام استفاده کن.");
    const arg = argText(ctx).trim().toLowerCase();
    const user = deps.store.getUser(id);
    if (arg === "on") user.voiceReply = true;
    else if (arg === "off") user.voiceReply = false;
    else user.voiceReply = !user.voiceReply;
    deps.store.save();
    await ctx.reply(`🔊 پاسخ صوتی: ${user.voiceReply ? "روشن" : "خاموش"}\nوقتی روشن باشد، جواب‌های مادلین را به‌صورت پیام صوتی می‌فرستم.`);
  });

  bot.command("phone", async (ctx) => {
    const st = await redisStatus();
    if (!st.enabled) {
      return ctx.reply(
        "📱 پخش صدا روی گوشی فعال نیست.\n" +
          "برای فعال‌سازی، `REDIS_URL` را در فایل `.env` تنظیم کن و بات را ری‌استارت کن. (نمونه: redis://localhost:6379)"
      );
    }
    const status = st.connected ? "✅ متصل" : "❌ قطع";
    const last = st.lastAt ? new Date(st.lastAt).toLocaleTimeString("fa-IR") : "—";
    await ctx.reply(
      `📱 پخش صدا روی گوشی\n` +
        `وضعیت Redis: ${status}\n` +
        `فهرست: \`${st.list}\`\n` +
        `صداهای ذخیره‌شده: ${st.entries}\n` +
        `آخرین صدا: ${last}\n\n` +
        "هر صوتی که مادلین بسازد (در تلگرام یا نه) به این فهرست اضافه می‌شود و اپ گوشی می‌تواند آن را بخواند."
    );
  });

  bot.command("transcribe", async (ctx) => {
    const p = ctx.message && ctx.message.reply_to_message;
    const v = (p && (p.voice || p.audio || p.video_note)) || null;
    if (!v) return ctx.reply("🎙 روی یک پیام صوتی ریپلای کن: /transcribe");
    await ctx.replyWithChatAction("typing");
    try {
      const text = await transcribeVoice(ctx, v.file_id, v.mime_type || "");
      await replyLong("🎤 متن پیام:\n\n" + text)(ctx);
    } catch (err) {
      await ctx.reply(friendly(err));
    }
  });

  bot.on("message:voice", async (ctx, next) => {
    if (ctx.chat.type !== "private" || !ctx.from) return next();
    const v = ctx.message.voice;
    await ctx.replyWithChatAction("typing");
    try {
      const text = await transcribeVoice(ctx, v.file_id, v.mime_type || "audio/ogg");
      await ctx.reply(`🎤 ${text}`);
      await aiReply(ctx, text, deps);
    } catch (err) {
      if (err.message === "NO_GEMINI_KEY") {
        await ctx.reply(setupHint());
      } else {
        console.error("voice handler error:", err);
        await ctx.reply(friendly(err));
      }
    }
    return next();
  });

  bot.on("message:video_note", async (ctx, next) => {
    if (ctx.chat.type !== "private" || !ctx.from) return next();
    const v = ctx.message.video_note;
    await ctx.replyWithChatAction("typing");
    try {
      const text = await transcribeVoice(ctx, v.file_id, "video/mp4");
      await ctx.reply(`🎤 ${text}`);
      await aiReply(ctx, text, deps);
    } catch (err) {
      if (err.message !== "NO_GEMINI_KEY") console.error("video note handler error:", err);
      await ctx.reply(friendly(err));
    }
    return next();
  });
}
