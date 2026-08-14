import { InlineKeyboard } from "grammy";
import { reg, argText, setupHint } from "../utils.js";
import {
  getPhotoFrom,
  resolvePhoto,
  setPending,
  getPending,
  processLocal,
  processAI,
  persistImage,
  unlinkIfDifferent,
} from "../image.js";

const NO_PHOTO_MSG =
  "📷 اول یک عکس بفرست، یا روی یک عکس ریپلای کن.\n" +
  "آخرین عکسی که فرستادهای هم قابل پردازش است.";

const editPending = new Map();

function friendly(err) {
  const m = String(err && err.message ? err.message : err);
  if (m === "NO_GEMINI_KEY") return setupHint();
  if (m === "AI_TIMEOUT") return "⏳ پاسخ مدل بیش از حد طول کشید؛ دوباره تلاش کن.";
  if (m === "processing_timed_out") return "⏳ پردازش بیش از حد طول کشید؛ عکس کوچکتری امتحان کن.";
  if (m === "IMAGE_EMPTY") return "🤖 نتوانستم تصویر تولید کنم؛ دوباره تلاش کن.";
  if (m === "EMPTY_RESPONSE") return "🤖 پاسخی دریافت نشد؛ دوباره تلاش کن.";
  if (m === "input_too_large") return "📦 فایل ورودی خیلی بزرگ است (حداکثر ۲۰ مگابایت).";
  if (m === "output_too_large") return "📦 خروجی بیش از ۴۵ مگابایت شد.";
  if (m === "bad_params") return "پارامتر درست نیست؛ راهنمای دستور را ببین.";
  if (m === "NOT_IMAGE") return "این فایل تصویر نیست.";
  return "⚠️ خطا در پردازش:\n" + m.slice(0, 300);
}

async function sendImage(ctx, res, caption) {
  const { InputFile } = await import("grammy");
  const name = "maddy_result." + res.ext;
  const input = new InputFile(res.buffer, name);
  let cap = caption || "";
  if (res.text) cap = cap ? cap + "\n\n" + res.text.slice(0, 800) : res.text.slice(0, 800);
  cap = cap.slice(0, 1024);
  if (res.ext === "jpg" || res.ext === "jpeg") {
    return ctx.replyWithPhoto(input, { caption: cap });
  }
  return ctx.replyWithDocument(input, { caption: cap });
}

async function setResultPending(userId, res) {
  const saved = await persistImage(res.buffer, res.ext);
  setPending(userId, { path: saved, ext: res.ext, mime: res.mime });
  return saved;
}

/* ---------------- command runners ---------------- */

async function runLocalCmd(ctx, action, parseParams) {
  const userId = ctx.from ? ctx.from.id : null;
  const photo = await resolvePhoto(ctx, userId);
  if (!photo) return ctx.reply(NO_PHOTO_MSG);
  await ctx.replyWithChatAction("upload_photo");
  try {
    const params = parseParams ? parseParams(argText(ctx)) : {};
    const res = await processLocal(photo.path, { action, params });
    const saved = await setResultPending(userId, res);
    const meta = res.meta && res.meta.w ? ` (${res.meta.w}×${res.meta.h})` : "";
    await sendImage(ctx, res, `✅ ${label(action)}${meta}`);
    await unlinkIfDifferent(photo, saved);
  } catch (err) {
    await ctx.reply(friendly(err));
  }
}

async function runAICmd(ctx, action, photo, prompt, userId) {
  await ctx.replyWithChatAction("typing");
  try {
    const res = await processAI(photo ? photo.path : null, { action, prompt });
    if (res.kind === "text") {
      await ctx.reply(res.text);
      return;
    }
    const saved = await setResultPending(userId, res);
    await sendImage(ctx, res, `✅ ${label(action)}`);
    await unlinkIfDifferent(photo, saved);
  } catch (err) {
    await ctx.reply(friendly(err));
  }
}

function label(action) {
  const L = {
    compress: "فشردهسازی",
    resize: "تغییر اندازه",
    square: "مربع",
    crop: "برش",
    rotate: "چرخش",
    flip: "آینه",
    bw: "سیاهوسفید",
    sepia: "سپیا",
    blur: "محو",
    sharpen: "شارپسازی",
    brightness: "روشنایی",
    contrast: "کنتراست",
    saturate: "اشباع رنگ",
    format: "تبدیل فرمت",
    sticker: "استیکر",
    thumbnail: "بندانگشتی",
    watermark: "واترمارک",
    caption: "نوشته روی عکس",
    circle: "برش دایرهای",
    round: "گوشهگرد",
    upscale: "بزرگنمایی",
    imagine: "تولید تصویر",
    edit: "ویرایش هوشمند",
    removebg: "حذف پسزمینه",
    restore: "ترمیم",
    style: "سبک هنری",
    upscaleai: "بزرگنمایی هوشمند",
    describe: "توصیف تصویر",
    ocr: "استخراج متن",
    askphoto: "سؤال از تصویر",
    qrscan: "اسکن QR",
  };
  return L[action] || action;
}

/* ---------------- keyboards ---------------- */

function btn(text, data) {
  return new InlineKeyboard().text(text, data);
}

function mainKb() {
  return new InlineKeyboard()
    .text("💾 کمحجم کن", "img:compress").text("⬜ مربع", "img:square").text("⚪ دایره", "img:circle").text("🧩 استیکر", "img:sticker").row()
    .text("🌚 سیاهوسفید", "img:bw").text("🖼 سپیا", "img:sepia").text("🔄 چرخش", "img:rotate").text("↔️ آینه", "img:flip").row()
    .text("📝 شرح تصویر", "img:describe").text("🔤 استخراج متن", "img:ocr").text("➖ حذف پسزمینه", "img:removebg").text("🖌 ویرایش AI", "img:edit").row()
    .text("بیشتر ▸", "img:more").text("✖️ بستن", "img:close");
}

function moreKb() {
  return new InlineKeyboard()
    .text("✂️ برش", "img:crop").text("📐 اندازه", "img:resize").text("📦 فرمت", "img:format").text("🌫 محو", "img:blur").row()
    .text("✨ شارپ", "img:sharpen").text("🔎 بندانگشتی", "img:thumbnail").text("🏷 واترمارک", "img:watermark").text("📝 نوشته", "img:caption").row()
    .text("🔍 بزرگنمایی", "img:upscale").text("🎨 سبک هنری", "img:style").text("🛠 ترمیم", "img:restore").text("🔳 اسکن QR", "img:qrscan").row()
    .text("🚀 بزرگ AI", "img:upscaleai").row()
    .text("◀️ بازگشت", "img:main").text("✖️ بستن", "img:close");
}

function optsKb(items, prefix, back = true) {
  const kb = new InlineKeyboard();
  items.forEach((it, i) => {
    kb.text(it.label, `${prefix}:${it.value}`);
    if ((i + 1) % 4 === 0) kb.row();
  });
  if ((items.length % 4) !== 0) kb.row();
  if (back) kb.text("◀️ بازگشت", "img:main").text("✖️", "img:close");
  return kb;
}

const CROP_OPTS = [
  { label: "⬛ 1:1", value: "1:1" },
  { label: "📺 16:9", value: "16:9" },
  { label: "📱 9:16", value: "9:16" },
  { label: "🖥 4:3", value: "4:3" },
  { label: "🖼 3:4", value: "3:4" },
];
const ROTATE_OPTS = [
  { label: "↻ 90°", value: "90" },
  { label: "↺ 180°", value: "180" },
  { label: "↺ 270°", value: "270" },
];
const STYLE_OPTS = [
  { label: "🎨 کارتون", value: "cartoon" },
  { label: "👾 پیکسلی", value: "pixel" },
  { label: "⛩ انیمه", value: "anime" },
  { label: "🎨 آبرنگ", value: "watercolor" },
  { label: "✏️ اسکچ", value: "sketch" },
  { label: "💡 نئون", value: "neon" },
  { label: "🖌 رنگروغن", value: "oil" },
  { label: "🌃 سایبرپانک", value: "cyberpunk" },
  { label: "📷 وینتیج", value: "vintage" },
  { label: "🖼 پاپآرت", value: "pop" },
];
const FORMAT_OPTS = [
  { label: "🖼 JPG", value: "jpg" },
  { label: "📄 PNG", value: "png" },
  { label: "🌐 WEBP", value: "webp" },
];
const RESIZE_OPTS = [
  { label: "📏 512", value: "512" },
  { label: "📏 800", value: "800" },
  { label: "📏 1080", value: "1080" },
  { label: "📏 1440", value: "1440" },
];

/* ---------------- register ---------------- */

export default function register(bot) {
  reg("imagine", { usage: "<prompt>", desc: "Generate an image from text (AI)", group: "image" });
  reg("edit", { usage: "<instruction>", desc: "Edit the photo with natural language (AI)", group: "image" });
  reg("removebg", { desc: "Remove the photo background (AI)", group: "image" });
  reg("restore", { desc: "Restore and enhance an old photo (AI)", group: "image" });
  reg("style", { usage: "<preset>", desc: "Apply an art style (cartoon, anime, neon, ...) (AI)", group: "image" });
  reg("upscaleai", { desc: "Upscale the photo 4x with AI", group: "image" });
  reg("describe", { desc: "Describe the photo (AI vision)", group: "image" });
  reg("ocr", { desc: "Extract text from the photo (AI)", group: "image" });
  reg("askphoto", { usage: "<question>", desc: "Ask a question about the photo (AI)", group: "image" });
  reg("qrscan", { desc: "Read a QR code / barcode from the photo (AI)", group: "image" });

  reg("compress", { usage: "[targetKB]", desc: "Compress the photo (default ~500KB)", group: "image" });
  reg("resize", { usage: "<W>x<H> or <W>", desc: "Resize the photo", group: "image" });
  reg("square", { desc: "Center-crop to a square", group: "image" });
  reg("crop", { usage: "<ratio>", desc: "Crop by aspect ratio (1:1, 16:9, ...)", group: "image" });
  reg("rotate", { usage: "<90|180|270>", desc: "Rotate the photo", group: "image" });
  reg("flip", { usage: "[h|v]", desc: "Mirror the photo", group: "image" });
  reg("bw", { desc: "Convert to black and white", group: "image" });
  reg("sepia", { desc: "Apply a sepia tone", group: "image" });
  reg("blur", { usage: "[sigma]", desc: "Blur the photo", group: "image" });
  reg("sharpen", { desc: "Sharpen the photo", group: "image" });
  reg("brightness", { usage: "<-100..100>", desc: "Adjust brightness", group: "image" });
  reg("contrast", { usage: "<-100..100>", desc: "Adjust contrast", group: "image" });
  reg("saturate", { usage: "<-100..100>", desc: "Adjust color saturation", group: "image" });
  reg("format", { usage: "<jpg|png|webp>", desc: "Convert image format", group: "image" });
  reg("sticker", { desc: "Make a 512x512 Telegram sticker (webp)", group: "image" });
  reg("thumbnail", { desc: "Make a small thumbnail", group: "image" });
  reg("watermark", { usage: "<text>", desc: "Add a text watermark", group: "image" });
  reg("caption", { usage: "<text>", desc: "Write Persian text under the photo", group: "image" });
  reg("circle", { desc: "Circular crop (avatar) with transparent background", group: "image" });
  reg("round", { usage: "[radius]", desc: "Rounded corners", group: "image" });
  reg("upscale", { usage: "<2|3|4>", desc: "Upscale locally (lanczos)", group: "image" });

  /* ----- commands ----- */

  bot.command("imagine", async (ctx) => {
    const prompt = argText(ctx);
    if (!prompt) return ctx.reply("روش استفاده: /imagine <توضیح تصویر>\nمثال: /imagine یک گربه فضانورد");
    await runAICmd(ctx, "imagine", null, prompt, ctx.from ? ctx.from.id : null);
  });

  bot.command("edit", async (ctx) => {
    const prompt = argText(ctx);
    if (!prompt) return ctx.reply("روش استفاده: /edit <دستور تغییر>\nمثال: /edit پسزمینه را شب کن");
    const photo = await resolvePhoto(ctx, ctx.from ? ctx.from.id : null);
    if (!photo) return ctx.reply(NO_PHOTO_MSG);
    await runAICmd(ctx, "edit", photo, prompt, ctx.from ? ctx.from.id : null);
  });

  bot.command("askphoto", async (ctx) => {
    const q = argText(ctx);
    if (!q) return ctx.reply("روش استفاده: /askphoto <سؤال>");
    const photo = await resolvePhoto(ctx, ctx.from ? ctx.from.id : null);
    if (!photo) return ctx.reply(NO_PHOTO_MSG);
    await runAICmd(ctx, "askphoto", photo, q, ctx.from ? ctx.from.id : null);
  });

  bot.command("style", async (ctx) => {
    const preset = argText(ctx).toLowerCase() || "cartoon";
    const photo = await resolvePhoto(ctx, ctx.from ? ctx.from.id : null);
    if (!photo) return ctx.reply(NO_PHOTO_MSG);
    await runAICmd(ctx, "style", photo, preset, ctx.from ? ctx.from.id : null);
  });

  const simpleAI = (action, needsPhoto = true) =>
    async (ctx) => {
      if (needsPhoto) {
        const photo = await resolvePhoto(ctx, ctx.from ? ctx.from.id : null);
        if (!photo) return ctx.reply(NO_PHOTO_MSG);
        return runAICmd(ctx, action, photo, "", ctx.from ? ctx.from.id : null);
      }
      return runAICmd(ctx, action, null, "", ctx.from ? ctx.from.id : null);
    };

  bot.command("removebg", simpleAI("removebg"));
  bot.command("restore", simpleAI("restore"));
  bot.command("upscaleai", simpleAI("upscaleai"));
  bot.command("describe", simpleAI("describe"));
  bot.command("ocr", simpleAI("ocr"));
  bot.command("qrscan", simpleAI("qrscan"));

  bot.command("compress", (ctx) =>
    runLocalCmd(ctx, "compress", (a) => {
      const kb = parseInt(a, 10);
      return Number.isFinite(kb) && kb > 0 ? { targetKB: kb } : {};
    })
  );

  bot.command("resize", (ctx) =>
    runLocalCmd(ctx, "resize", (a) => {
      const m = a.match(/^(\d{1,5})(?:x(\d{1,5}))?$/i);
      if (!m) throw new Error("bad_params");
      return { width: m[1], height: m[2] || undefined };
    })
  );

  bot.command("square", (ctx) => runLocalCmd(ctx, "square", () => ({})));
  bot.command("crop", (ctx) => runLocalCmd(ctx, "crop", (a) => ({ ratio: a || "1:1" })));
  bot.command("rotate", (ctx) => runLocalCmd(ctx, "rotate", (a) => ({ deg: a || "90" })));
  bot.command("flip", (ctx) => runLocalCmd(ctx, "flip", (a) => ({ dir: String(a).toLowerCase() === "v" ? "v" : "h" })));
  bot.command("bw", (ctx) => runLocalCmd(ctx, "bw", () => ({})));
  bot.command("sepia", (ctx) => runLocalCmd(ctx, "sepia", () => ({})));
  bot.command("blur", (ctx) => runLocalCmd(ctx, "blur", (a) => ({ sigma: a || "5" })));
  bot.command("sharpen", (ctx) => runLocalCmd(ctx, "sharpen", () => ({})));
  bot.command("brightness", (ctx) => runLocalCmd(ctx, "brightness", (a) => ({ val: a || "10" })));
  bot.command("contrast", (ctx) => runLocalCmd(ctx, "contrast", (a) => ({ val: a || "10" })));
  bot.command("saturate", (ctx) => runLocalCmd(ctx, "saturate", (a) => ({ val: a || "20" })));
  bot.command("format", (ctx) => runLocalCmd(ctx, "format", (a) => ({ format: a || "webp" })));
  bot.command("sticker", (ctx) => runLocalCmd(ctx, "sticker", () => ({})));
  bot.command("thumbnail", (ctx) => runLocalCmd(ctx, "thumbnail", () => ({})));
  bot.command("watermark", (ctx) => runLocalCmd(ctx, "watermark", (a) => (a ? { text: a } : (() => { throw new Error("bad_params"); })())));
  bot.command("caption", (ctx) => runLocalCmd(ctx, "caption", (a) => (a ? { text: a } : (() => { throw new Error("bad_params"); })())));
  bot.command("circle", (ctx) => runLocalCmd(ctx, "circle", () => ({})));
  bot.command("round", (ctx) => runLocalCmd(ctx, "round", (a) => ({ radius: a || "60" })));
  bot.command("upscale", (ctx) => runLocalCmd(ctx, "upscale", (a) => ({ scale: a || "2" })));

  /* ----- photo auto-actions ----- */

  async function onPhoto(ctx) {
    const userId = ctx.from ? ctx.from.id : null;
    if (!userId) return;
    try {
      const p = await getPhotoFrom(ctx);
      setPending(userId, p);
      await ctx.reply("📸 عکس را گرفتم. چه کاری انجام دهم؟", { reply_markup: mainKb() });
    } catch (err) {
      await ctx.reply(friendly(err));
    }
  }

  bot.on("message:photo", onPhoto);

  bot.on("message:document", (ctx, next) => {
    const doc = ctx.message && ctx.message.document;
    if (!doc || !/^image\//i.test(doc.mime_type || "")) return next();
    return onPhoto(ctx);
  });

  /* ----- text listener for AI edit flow ----- */

  bot.on("message:text", async (ctx, next) => {
    const userId = ctx.from ? ctx.from.id : null;
    if (userId && editPending.has(userId)) {
      const pend = editPending.get(userId);
      editPending.delete(userId);
      const prompt = (ctx.message.text || "").trim();
      if (!prompt) return ctx.reply("دستور ویرایش را بنویس.");
      return runAICmd(ctx, "edit", pend, prompt, userId);
    }
    return next();
  });

  /* ----- keyboard callbacks ----- */

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data || "";
    if (!data.startsWith("img:")) return next();
    const userId = ctx.from ? ctx.from.id : null;
    const key = data.slice(4);
    await ctx.answerCallbackQuery().catch(() => {});
    const pend = getPending(userId);

    const editKb = (kb) => ctx.editMessageReplyMarkup({ reply_markup: kb }).catch(() => {});
    const runLocal = async (action, params) => {
      if (!pend) return ctx.reply(NO_PHOTO_MSG);
      await ctx.replyWithChatAction("upload_photo");
      try {
        const res = await processLocal(pend.path, { action, params });
        const saved = await setResultPending(userId, res);
        await sendImage(ctx, res, `✅ ${label(action)}`);
        await unlinkIfDifferent(pend, saved);
      } catch (err) {
        await ctx.reply(friendly(err));
      }
    };
    const runAI = async (action, prompt) => {
      if (!pend) return ctx.reply(NO_PHOTO_MSG);
      await runAICmd(ctx, action, pend, prompt || "", userId);
    };

    switch (true) {
      case key === "main": return editKb(mainKb());
      case key === "more": return editKb(moreKb());
      case key === "close": return ctx.deleteMessage().catch(() => {});
      case key === "crop": return editKb(optsKb(CROP_OPTS, "img:crop"));
      case key === "rotate": return editKb(optsKb(ROTATE_OPTS, "img:rotate"));
      case key === "style": return editKb(optsKb(STYLE_OPTS, "img:style"));
      case key === "format": return editKb(optsKb(FORMAT_OPTS, "img:format"));
      case key === "resize": return editKb(optsKb(RESIZE_OPTS, "img:resize"));
      case key.startsWith("crop:"): return runLocal("crop", { ratio: key.slice(5) });
      case key.startsWith("rotate:"): return runLocal("rotate", { deg: key.slice(7) });
      case key.startsWith("style:"): return runAI("style", key.slice(6));
      case key.startsWith("format:"): return runLocal("format", { format: key.slice(7) });
      case key.startsWith("resize:"): return runLocal("resize", { width: key.slice(7), height: undefined });
      case key === "edit":
        if (!pend) return ctx.reply(NO_PHOTO_MSG);
        editPending.set(userId, pend);
        return ctx.reply("🖌 حالا دستور ویرایش را بنویس.\nمثلاً: «آسمان را آبیتر کن» یا «کلاهی اضافه کن»");
      case key === "watermark":
        if (!pend) return ctx.reply(NO_PHOTO_MSG);
        return ctx.reply("برای واترمارک از دستور استفاده کن: /watermark <متن>");
      case key === "compress": return runLocal("compress", {});
      case key === "square": return runLocal("square", {});
      case key === "circle": return runLocal("circle", {});
      case key === "sticker": return runLocal("sticker", {});
      case key === "bw": return runLocal("bw", {});
      case key === "sepia": return runLocal("sepia", {});
      case key === "flip": return runLocal("flip", { dir: "h" });
      case key === "blur": return runLocal("blur", { sigma: "5" });
      case key === "sharpen": return runLocal("sharpen", {});
      case key === "thumbnail": return runLocal("thumbnail", {});
      case key === "upscale": return runLocal("upscale", { scale: "2" });
      case key === "describe": return runAI("describe", "");
      case key === "ocr": return runAI("ocr", "");
      case key === "qrscan": return runAI("qrscan", "");
      case key === "removebg": return runAI("removebg", "");
      case key === "restore": return runAI("restore", "");
      case key === "upscaleai": return runAI("upscaleai", "");
      default:
        return next();
    }
  });
}
