import { spawn, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InputFile } from "grammy";
import { reg, argText } from "../utils.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TMP = path.join(ROOT, "data", "tmp");

let PY;
try {
  PY = execFileSync("python", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
} catch {
  PY = "python";
}

const MAX_BYTES = 45 * 1024 * 1024;

function run(args, timeoutMs = 900000) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, ["-m", "yt_dlp", ...args], { windowsHide: true });
    let out = "";
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error("Timed out while downloading. The file may be too large or the site is slow."));
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(out.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

const YT_CLIENTS = ["android", null, "web"];

async function runWithRetry(args, isYoutube) {
  const variants = isYoutube ? YT_CLIENTS : [null];
  let lastErr;
  for (const client of variants) {
    const clientArgs = client
      ? ["--extractor-args", `youtube:player_client=${client}`]
      : [];
    try {
      return await run([...args, ...clientArgs]);
    } catch (err) {
      lastErr = err;
      if (/timed out/i.test(String(err.message || err))) throw err;
    }
  }
  throw lastErr;
}

function mediaType(file) {
  const e = path.extname(file).toLowerCase();
  if (/\.(mp4|webm|mkv|mov|avi|m4v)$/.test(e)) return "video";
  if (/\.(mp3|m4a|opus|ogg|wav|flac|aac)$/.test(e)) return "audio";
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(e)) return "photo";
  return "document";
}

function fmtSize(n) {
  return n > 1048576 ? (n / 1048576).toFixed(1) + "MB" : (n / 1024).toFixed(0) + "KB";
}

async function sendFile(ctx, file, title) {
  const input = new InputFile(file, path.basename(file));
  const type = mediaType(file);
  const caption = title ? title.slice(0, 100) : undefined;
  if (type === "video") return ctx.replyWithVideo(input, { caption });
  if (type === "audio") return ctx.replyWithAudio(input, { caption, title: caption });
  if (type === "photo") return ctx.replyWithPhoto(input, { caption });
  return ctx.replyWithDocument(input, { caption });
}

function friendlyError(err) {
  const msg = String(err.message || err);
  if (/too large|max filesize|exceeds/i.test(msg)) {
    return "فایل بزرگ‌تر از ۵۰ مگابایت است و تلگرام امکان تحویل آن را ندارد. یک ویدیوی کوتاه‌تر یا کیفیت پایین‌تر را امتحان کن.";
  }
  if (/unsupported url|inappropriate/i.test(msg)) {
    return "این لینک پشتیبانی نمی‌شود یا نیاز به حساب کاربری دارد (مثلاً ویدیوهای خصوصی).";
  }
  if (/timed out/i.test(msg)) {
    return msg;
  }
  return "متأسفانه دانلود ناموفق بود:\n" + msg.split("\n").slice(-3).join("\n");
}

async function download(ctx, url, mode) {
  const t = (url || "").trim();
  if (!t) {
    return ctx.reply(
      "یک لینک بفرست. مثال:\n" +
        "/dl https://www.youtube.com/watch?v=...\n" +
        "/insta https://www.instagram.com/reel/...\n" +
        "/mp3 https://www.youtube.com/watch?v=..."
    );
  }
  let parsed;
  try {
    parsed = new URL(t);
  } catch {
    return ctx.reply("لینک معتبر نیست.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return ctx.reply("فقط لینک‌های http/https پشتیبانی می‌شوند.");
  }

  await ctx.reply("در حال دانلود... این ممکن است چند لحظه طول بکشد ⏳");
  const action = mode === "audio" ? "upload_audio" : "upload_video";
  const actionTimer = setInterval(() => {
    ctx.replyWithChatAction(action).catch(() => {});
  }, 4000);

  const before = new Set(await fs.readdir(TMP).catch(() => []));
  await fs.mkdir(TMP, { recursive: true });

  const common = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--newline",
    "--no-continue",
    "--max-filesize", "45M",
    "-o", path.join(TMP, "%(id)s.%(ext)s"),
  ];
  const isYoutube = /(^|\.)(youtube\.com|youtu\.be)$/i.test(parsed.hostname);

  try {
    if (mode === "audio") {
      await runWithRetry([...common, "-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "5", t], isYoutube);
    } else {
      await runWithRetry(
        [...common, "-f", "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b", "--merge-output-format", "mp4", t],
        isYoutube
      );
    }

    const after = new Set(await fs.readdir(TMP));
    const created = [...after].filter((f) => !before.has(f));
    if (!created.length) throw new Error("No file produced by the downloader.");

    const sizes = await Promise.all(
      created.map(async (f) => {
        const full = path.join(TMP, f);
        return { full, size: (await fs.stat(full)).size };
      })
    );
    sizes.sort((a, b) => b.size - a.size);
    const { full, size } = sizes[0];

    if (size > 50 * 1024 * 1024) {
      await fs.unlink(full).catch(() => {});
      return ctx.reply("فایل دانلودشده از ۵۰ مگابایت بیشتر است و تلگرام آن را نمی‌پذیرد.");
    }

    await ctx.reply(`فایل آماده است (${fmtSize(size)}) — در حال ارسال...`);
    await sendFile(ctx, full, path.basename(full).replace(/\.[^.]+$/, ""));
  } catch (err) {
    await ctx.reply(friendlyError(err));
  } finally {
    clearInterval(actionTimer);
    const after = new Set(await fs.readdir(TMP).catch(() => []));
    for (const f of after) {
      if (!before.has(f)) await fs.unlink(path.join(TMP, f)).catch(() => {});
    }
  }
}

export default function register(bot) {
  reg("dl", { usage: "<url>", desc: "Download video/media from 1000+ sites", group: "media" });
  reg("yt", { usage: "<url>", desc: "Download a YouTube video", group: "media" });
  reg("insta", { usage: "<url>", desc: "Download from Instagram (post, reel, story)", group: "media" });
  reg("mp3", { usage: "<url>", desc: "Extract audio (mp3) from a video", group: "media" });

  bot.command(["dl", "yt", "insta"], (ctx) => download(ctx, argText(ctx), "video"));
  bot.command("mp3", (ctx) => download(ctx, argText(ctx), "audio"));
}
