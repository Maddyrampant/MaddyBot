import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "./config.js";
import { getAI } from "./ai.js";
import { uid } from "./utils.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, "data", "tmp");

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 45 * 1024 * 1024;
const PENDING_TTL = 15 * 60 * 1000;

const EXT_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

/* ---------------- temp helpers ---------------- */

async function ensureTmp() {
  await fs.mkdir(TMP, { recursive: true });
}

function tmpPath(ext) {
  return path.join(TMP, uid() + "." + ext);
}

export async function cleanupFile(p) {
  if (p) await fs.unlink(p).catch(() => {});
}

export async function persistImage(buffer, ext) {
  await ensureTmp();
  const p = tmpPath(ext || "png");
  await fs.writeFile(p, buffer);
  return p;
}

export async function cleanupFiles(paths) {
  await Promise.all(paths.filter(Boolean).map(cleanupFile));
}

export function mimeFromExt(ext) {
  return EXT_MIME[String(ext).toLowerCase().replace(/^\./, "")] || "image/jpeg";
}

export function extFromMime(mime) {
  if (/png/i.test(mime)) return "png";
  if (/webp/i.test(mime)) return "webp";
  if (/gif/i.test(mime)) return "gif";
  if (/bmp/i.test(mime)) return "bmp";
  return "jpg";
}

/* ---------------- ffmpeg ---------------- */

function runFfmpeg(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      windowsHide: true,
    });
    let out = "";
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error("processing_timed_out"));
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
      else {
        const tail = out.split("\n").slice(-6).join("\n").trim();
        reject(new Error(tail || "ffmpeg_error_" + code));
      }
    });
  });
}

function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", ["-hide_banner", "-loglevel", "error", ...args], {
      windowsHide: true,
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || "ffprobe_error_" + code))));
  });
}

export async function probeSize(input) {
  try {
    const out = await runFfprobe([
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      input,
    ]);
    const j = JSON.parse(out);
    const s = (j.streams || [])[0];
    if (s && s.width && s.height) return { w: Number(s.width), h: Number(s.height) };
  } catch {}
  return null;
}

async function readImage(path) {
  const buffer = await fs.readFile(path);
  if (buffer.length > MAX_OUTPUT_BYTES) throw new Error("output_too_large");
  return buffer;
}

/* ---------------- local (ffmpeg) processing ---------------- */

function escFilterComma(s) {
  return String(s).replace(/,/g, "\\,");
}

function drawTextEsc(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .slice(0, 120);
}

function fontPath() {
  const fonts = [
    "C:/Windows/Fonts/tahoma.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
  ];
  for (const f of fonts) if (existsSync(f)) return "C\\:/" + f.replace(/^C:\//, "").replace(/\//g, "/");
  return "C\\:/Windows/Fonts/arial.ttf";
}

async function shrinkToTarget(input, targetKB, maxWidth) {
  const steps = [
    { w: 1600, q: 80 },
    { w: 1600, q: 60 },
    { w: 1280, q: 55 },
    { w: 1080, q: 45 },
    { w: 900, q: 35 },
    { w: 720, q: 28 },
    { w: 560, q: 22 },
  ];
  const cap = maxWidth ? Math.min(Number(maxWidth) || 1600, 2400) : 1600;
  const target = Math.max(64, (Number(targetKB) || 500) * 1024);
  const made = [];
  let last = null;
  for (const s of steps) {
    if (s.w > cap) continue;
    const out = tmpPath("webp");
    const vf = `scale=${Math.min(s.w, cap)}:-2`;
    await runFfmpeg(["-i", input, "-vf", vf, "-q:v", String(s.q), out]);
    made.push(out);
    const size = (await fs.stat(out)).size;
    last = out;
    if (size <= target) break;
  }
  const final = last;
  await cleanupFiles(made.filter((f) => f !== final));
  return final;
}

async function runLocal(input, out, filters, encode) {
  const args = ["-i", input];
  if (filters && filters.length) args.push("-vf", filters.join(","));
  args.push(...(encode || []), out);
  await runFfmpeg(args);
}

export async function runFFmpeg(args, timeoutMs = 90000) {
  return runFfmpeg(args, timeoutMs);
}

export function tmpPathFor(ext) {
  return tmpPath(ext);
}

export async function ensureTmpDir() {
  return ensureTmp();
}

/**
 * Apply a local (offline, ffmpeg) image operation.
 * @param {string} input  path to source image
 * @param {{action:string, params?:object}} req
 * @returns {Promise<{buffer:Buffer, ext:string, mime:string, meta:object}>}
 */
export async function processLocal(input, { action, params = {} }) {
  await ensureTmp();
  const size = await probeSize(input);
  const w = size ? size.w : 0;
  const h = size ? size.h : 0;
  let outExt = (params.format || "jpg").toString().toLowerCase().replace(/^\./, "");
  if (action === "circle" || action === "round") outExt = "png";
  if (action === "sticker") outExt = "webp";
  const out = tmpPath(outExt);
  let filters = [];
  let encode = [];
  let meta = { w, h, action };

  const toInt = (v, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
  };

  switch (action) {
    case "compress": {
      const targetKB = toInt(params.targetKB, 0);
      if (targetKB > 0) {
        const p = await shrinkToTarget(input, targetKB, params.maxWidth);
        const buffer = await readImage(p);
        await cleanupFile(p);
        return { buffer, ext: "webp", mime: "image/webp", meta };
      }
      filters = [w && w > 1600 ? "scale=1600:-2" : null].filter(Boolean);
      encode = ["-q:v", String(toInt(params.quality, 30))];
      break;
    }
    case "resize": {
      const rw = params.width ? toInt(params.width, 0) : 0;
      const rh = params.height ? toInt(params.height, 0) : 0;
      if (rw > 0 && rh > 0) filters = [`scale=${rw}:${rh}`];
      else if (rw > 0) filters = [`scale=${rw}:-2`];
      else if (rh > 0) filters = [`scale=-2:${rh}`];
      else throw new Error("bad_params");
      encode = ["-q:v", "3"];
      break;
    }
    case "square": {
      const s = toInt(params.size, 1080);
      filters = [`crop=min(iw\\,ih):min(iw\\,ih),scale=${s}:${s}`];
      encode = ["-q:v", "3"];
      break;
    }
    case "crop": {
      const ratio = String(params.ratio || "1:1");
      const parts = ratio.split(":");
      const arW = parseFloat(parts[0]);
      const arH = parseFloat(parts[1]);
      if (!w || !h || !arW || !arH) throw new Error("bad_params");
      const targetAR = arW / arH;
      let nw, nh;
      if (w / h > targetAR) {
        nw = Math.floor(h * targetAR);
        nh = h;
      } else {
        nw = w;
        nh = Math.floor(w / targetAR);
      }
      if (nw % 2) nw--;
      if (nh % 2) nh--;
      if (nw < 2 || nh < 2) throw new Error("bad_params");
      filters = [`crop=${nw}:${nh}:(iw-${nw})/2:(ih-${nh})/2`];
      encode = ["-q:v", "3"];
      break;
    }
    case "rotate": {
      const deg = ((toInt(params.deg, 0) % 360) + 360) % 360;
      if (deg === 90) filters = ["transpose=1"];
      else if (deg === 180) filters = ["transpose=2,transpose=2"];
      else if (deg === 270) filters = ["transpose=2"];
      else throw new Error("bad_params");
      encode = ["-q:v", "3"];
      break;
    }
    case "flip": {
      filters = [params.dir === "v" ? "vflip" : "hflip"];
      encode = ["-q:v", "3"];
      break;
    }
    case "bw": {
      filters = ["format=gray"];
      encode = ["-q:v", "3"];
      break;
    }
    case "sepia": {
      filters = ["colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"];
      encode = ["-q:v", "3"];
      break;
    }
    case "blur": {
      const s = Math.max(1, toInt(params.sigma, 5));
      filters = [`gblur=sigma=${Math.min(s, 30)}`];
      encode = ["-q:v", "3"];
      break;
    }
    case "sharpen": {
      filters = ["unsharp=5:5:1.2:5:5:0.0"];
      encode = ["-q:v", "3"];
      break;
    }
    case "brightness": {
      const v = Math.max(-100, Math.min(100, toInt(params.val, 0)));
      filters = [`eq=brightness=${v / 100}`];
      encode = ["-q:v", "3"];
      break;
    }
    case "contrast": {
      const v = Math.max(-100, Math.min(100, toInt(params.val, 0)));
      filters = [`eq=contrast=${(100 + v) / 100}`];
      encode = ["-q:v", "3"];
      break;
    }
    case "saturate": {
      const v = Math.max(-100, Math.min(100, toInt(params.val, 0)));
      filters = [`eq=saturation=${(100 + v) / 100}`];
      encode = ["-q:v", "3"];
      break;
    }
    case "format": {
      encode =
        outExt === "jpg" || outExt === "jpeg"
          ? ["-q:v", "2"]
          : outExt === "webp"
            ? ["-q:v", "90"]
            : [];
      break;
    }
    case "sticker": {
      filters = ["crop=min(iw\\,ih):min(iw\\,ih),scale=512:512"];
      encode = ["-q:v", "90"];
      break;
    }
    case "thumbnail": {
      filters = ["scale=200:200:force_original_aspect_ratio=decrease"];
      encode = ["-q:v", "6"];
      break;
    }
    case "watermark": {
      const text = drawTextEsc(params.text || "MaddyBot");
      if (!text) throw new Error("bad_params");
      const fs_ = Math.max(20, Math.round((h || 800) / 22));
      filters = [
        `drawtext=fontfile=${fontPath()}:text='${text}':fontsize=${fs_}:fontcolor=white@0.85:borderw=2:bordercolor=black@0.55:x=(w-text_w)/2:y=h-text_h-40`,
      ];
      encode = ["-q:v", "5"];
      break;
    }
    case "circle": {
      filters = [
        "crop=min(iw\\,ih):min(iw\\,ih),scale=1024:1024,format=rgba," +
          "geq=a='if(lte(sqrt(pow(X-W/2,2)+pow(Y-H/2,2)),min(W/2,H/2)),255,0)'",
      ];
      break;
    }
    case "round": {
      const R = Math.max(1, Math.min(toInt(params.radius, 60), 500));
      const aExpr =
        `a='if(lt(X,${R}),if(lt(Y,${R}),if(lte(pow(X-${R},2)+pow(Y-${R},2),pow(${R},2)),255,0),` +
        `if(gt(Y,W-1-${R}),if(lte(pow(X-${R},2)+pow(Y-(W-1-${R}),2),pow(${R},2)),255,0),255)),` +
        `if(gt(X,W-1-${R}),if(lt(Y,${R}),if(lte(pow(X-(W-1-${R}),2)+pow(Y-${R},2),pow(${R},2)),255,0),` +
        `if(gt(Y,W-1-${R}),if(lte(pow(X-(W-1-${R}),2)+pow(Y-(W-1-${R}),2),pow(${R},2)),255,0),255)),255))'`;
      filters = [`crop=min(iw\\,ih):min(iw\\,ih),scale=1024:1024,format=rgba,geq=${aExpr}`];
      break;
    }
    case "upscale": {
      const n = Math.max(1, Math.min(8, toInt(params.scale, 2)));
      if (w && h) filters = [`scale=${w * n}:${h * n}:flags=lanczos`];
      else throw new Error("bad_params");
      encode = ["-q:v", "2"];
      break;
    }
    default:
      throw new Error("unknown_action");
  }

  if (outExt === "png") {
    // keep alpha from circle/round; png has no -q:v
  }

  await runLocal(input, out, filters, encode);
  const mime = mimeFromExt(outExt);
  const buffer = await readImage(out);
  const sz = await probeSize(out);
  meta = { ...meta, w: sz ? sz.w : w, h: sz ? sz.h : h };
  await cleanupFile(out);
  return { buffer, ext: outExt, mime, meta };
}

/* ---------------- Gemini (AI) processing ---------------- */

const STYLE_MAP = {
  cartoon: "Transform this into a vibrant cartoon illustration: bold outlines, simplified shapes, saturated colors.",
  pixel: "Convert this into pixel art: visible square pixels, retro video-game style.",
  anime: "Convert this into a detailed anime/manga illustration style.",
  watercolor: "Convert this into a soft watercolor painting style.",
  sketch: "Convert this into a pencil sketch: grayscale, clean lines, white background.",
  neon: "Convert this into a neon-glow style: glowing edges, vivid neon colors, dark background.",
  oil: "Convert this into an oil painting with visible brush strokes.",
  cyberpunk: "Convert this into a cyberpunk style with neon city colors and lighting.",
  vintage: "Convert this into a vintage film photo: faded colors, warm tones, film grain.",
  pop: "Convert this into a pop-art style: bold flat colors, halftone dots, comic look.",
};

const ACTION_PROMPTS = {
  edit: (p) =>
    String(p || "Enhance this image") +
    " Keep the main subject and overall composition; make only the requested change.",
  removebg: () =>
    "Remove the background completely. Keep only the main subject. The background must be transparent.",
  restore: () =>
    "Restore and enhance this photo: remove scratches, noise and dust, fix color, sharpen. Keep it realistic and faithful to the original.",
  upscaleai: () => "Upscale this image 4x, keep it pixel-identical, very sharp, no added artifacts.",
  imagine: (p) => String(p || "A beautiful scene"),
  style: (p) => STYLE_MAP[p] || STYLE_MAP.cartoon,
  describe: () =>
    "Describe this image in detail in Persian: the main subject, people/objects, setting, colors, mood, and any visible text.",
  ocr: () =>
    "Extract ALL text visible in this image and return it exactly, preserving the original language. If there is no readable text, reply exactly: NO_TEXT",
  qrscan: () =>
    "Read the QR code or barcode in this image and return its decoded content (URL or text) exactly. If there is no code, reply exactly: NO_CODE",
  askphoto: (p) => String(p || "What can you tell me about this image?"),
};

const IMAGE_OUTPUT_ACTIONS = new Set(["imagine", "edit", "removebg", "restore", "upscaleai", "style"]);

function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("AI_TIMEOUT")), ms)),
  ]);
}

function extractImage(res) {
  for (const cand of res.candidates || []) {
    for (const part of (cand.content && cand.content.parts) || []) {
      if (part.inlineData && part.inlineData.data) return part.inlineData;
    }
  }
  return null;
}

/**
 * Run a Gemini-powered image operation.
 * @param {string|null} input  source image path (null for imagine)
 * @param {{action:string, prompt?:string}} req
 * @returns {Promise<{kind:'image', buffer:Buffer, mime:string, ext:string, text?:string}|{kind:'text', text:string}>}
 */
export async function processAI(input, { action, prompt }) {
  if (!config.geminiKey) throw new Error("NO_GEMINI_KEY");
  const ai = getAI();
  const a = String(action || "describe");
  const wantsImage = IMAGE_OUTPUT_ACTIONS.has(a);

  const parts = [];
  if (input && a !== "imagine") {
    const mime = mimeFromExt(path.extname(input));
    const data = await fs.readFile(input).then((b) => b.toString("base64"));
    if (Buffer.byteLength(data, "base64") > MAX_INPUT_BYTES) throw new Error("input_too_large");
    parts.push({ inlineData: { mimeType: mime, data } });
  }
  parts.push({ text: (ACTION_PROMPTS[a] || ACTION_PROMPTS.describe)(prompt) });

  try {
    if (wantsImage) {
      const res = await withTimeout(
        ai.models.generateContent({
          model: config.imageModel,
          contents: [{ role: "user", parts }],
          config: { responseModalities: ["IMAGE", "TEXT"] },
        }),
        150000
      );
      const img = extractImage(res);
      const text = (res.text || "").trim();
      if (!img) throw new Error("IMAGE_EMPTY");
      const buffer = Buffer.from(img.data, "base64");
      const mime = img.mimeType || "image/png";
      return { kind: "image", buffer, mime, ext: extFromMime(mime), text };
    }
    const res = await withTimeout(
      ai.models.generateContent({
        model: config.model,
        contents: [{ role: "user", parts }],
      }),
      60000
    );
    const text = (res.text || "").trim();
    if (!text) throw new Error("EMPTY_RESPONSE");
    return { kind: "text", text };
  } catch (err) {
    if (err.message === "AI_TIMEOUT") throw new Error("AI_TIMEOUT");
    throw err;
  }
}

/* ---------------- photo resolution (Telegram) ---------------- */

const pending = new Map();

export function setPending(userId, info) {
  pending.set(String(userId), { ...info, ts: Date.now() });
}

export function getPending(userId) {
  const e = pending.get(String(userId));
  if (!e) return null;
  if (Date.now() - e.ts > PENDING_TTL) {
    pending.delete(String(userId));
    return null;
  }
  return e;
}

async function downloadFileId(ctx, fileId, ext, mime) {
  await ensureTmp();
  const out = tmpPath(ext || "jpg");
  const file = await ctx.getFile(fileId);
  await file.download(out);
  return { path: out, ext: ext || "jpg", mime: mime || "image/jpeg" };
}

export async function downloadFile(ctx, fileId, ext, mime) {
  return downloadFileId(ctx, fileId, ext, mime);
}

export async function getPhotoFrom(ctx) {
  const msg = ctx.message || {};
  const photo = msg.photo && msg.photo.length ? msg.photo[msg.photo.length - 1] : null;
  if (photo) {
    return downloadFileId(ctx, photo.file_id, "jpg", "image/jpeg");
  }
  const doc = msg.document;
  if (doc && /^image\//i.test(doc.mime_type || "")) {
    const ext = doc.file_name ? path.extname(doc.file_name).replace(/^\./, "").toLowerCase() : extFromMime(doc.mime_type);
    return downloadFileId(ctx, doc.file_id, ext || "jpg", doc.mime_type);
  }
  return null;
}

/**
 * Resolve the photo for the current command: direct photo in the message,
 * a photo in the replied-to message, or the last pending photo of the user.
 */
export async function resolvePhoto(ctx, userId) {
  let p = await getPhotoFrom(ctx);
  if (!p && ctx.message && ctx.message.reply_to_message) {
    const sub = { ...ctx.message.reply_to_message };
    if (sub.photo && sub.photo.length) {
      const sizes = sub.photo;
      const largest = sizes[sizes.length - 1];
      p = await downloadFileId(ctx, largest.file_id, "jpg", "image/jpeg");
    } else if (sub.document && /^image\//i.test(sub.document.mime_type || "")) {
      p = await downloadFileId(ctx, sub.document.file_id, extFromMime(sub.document.mime_type), sub.document.mime_type);
    }
  }
  if (!p) {
    const pend = getPending(userId);
    if (pend && pend.path && existsSync(pend.path)) p = pend;
  }
  return p;
}

export async function unlinkIfDifferent(p, keepPath) {
  if (p && p.path && p.path !== keepPath) await cleanupFile(p.path);
}
