import { createHash } from "crypto";
import { reg, argText } from "../utils.js";

const LEET_MAP = { a: "4", b: "8", e: "3", g: "6", i: "1", l: "1", o: "0", s: "5", t: "7", z: "2" };
const EMOJI_MAP = {
  love: "\u2764\uFE0F",
  happy: "\u{1F600}",
  sad: "\u{1F622}",
  cool: "\u{1F60E}",
  fire: "\u{1F525}",
  money: "\u{1F4B0}",
  lol: "\u{1F602}",
  wow: "\u{1F62E}",
  cat: "\u{1F431}",
  dog: "\u{1F436}",
  food: "\u{1F354}",
  pizza: "\u{1F355}",
  sun: "\u2600\uFE0F",
  rain: "\u{1F327}\uFE0F",
  star: "\u2B50",
  heart: "\u{1F49B}",
};

export default function register(bot) {
  reg("upper", { usage: "<text>", desc: "UPPERCASE text", group: "text" });
  reg("lower", { usage: "<text>", desc: "lowercase text", group: "text" });
  reg("title", { usage: "<text>", desc: "Title Case text", group: "text" });
  reg("reverse", { usage: "<text>", desc: "Reverse text", group: "text" });
  reg("count", { usage: "<text>", desc: "Count characters and words", group: "text" });
  reg("base64", { usage: "<text>", desc: "Encode to base64 (decode <text> to decode)", group: "text" });
  reg("urlencode", { usage: "<text>", desc: "URL-encode text (decode <text> to decode)", group: "text" });
  reg("md5", { usage: "<text>", desc: "MD5 hash", group: "text" });
  reg("sha256", { usage: "<text>", desc: "SHA-256 hash", group: "text" });
  reg("slug", { usage: "<text>", desc: "Convert to URL slug", group: "text" });
  reg("leet", { usage: "<text>", desc: "Convert to leetspeak", group: "text" });
  reg("mock", { usage: "<text>", desc: "Spongebob mock case", group: "text" });
  reg("emojify", { usage: "<text>", desc: "Add matching emojis to words", group: "text" });

  bot.command("upper", (ctx) => cmdText(ctx, (t) => t.toUpperCase()));
  bot.command("lower", (ctx) => cmdText(ctx, (t) => t.toLowerCase()));
  bot.command("reverse", (ctx) => cmdText(ctx, (t) => [...t].reverse().join("")));
  bot.command("title", (ctx) =>
    cmdText(ctx, (t) => t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()))
  );
  bot.command("count", (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /count <text>");
    return ctx.reply(`Characters: ${[...t].length}\nWords: ${t.trim().split(/\s+/).filter(Boolean).length}`);
  });
  bot.command("base64", (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /base64 <text>");
    try {
      if (/^decode\s+/i.test(t)) return ctx.reply(Buffer.from(t.replace(/^decode\s+/i, ""), "base64").toString("utf8"));
      return ctx.reply(Buffer.from(t).toString("base64"));
    } catch {
      return ctx.reply("Invalid base64.");
    }
  });
  bot.command("urlencode", (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /urlencode <text>");
    try {
      if (/^decode\s+/i.test(t)) return ctx.reply(decodeURIComponent(t.replace(/^decode\s+/i, "")));
      return ctx.reply(encodeURIComponent(t));
    } catch {
      return ctx.reply("Invalid encoding.");
    }
  });
  bot.command("md5", (ctx) => cmdHash(ctx, "md5"));
  bot.command("sha256", (ctx) => cmdHash(ctx, "sha256"));
  bot.command("slug", (ctx) =>
    cmdText(ctx, (t) =>
      t
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
  );
  bot.command("leet", (ctx) =>
    cmdText(ctx, (t) => t.replace(/[a-z]/g, (c) => LEET_MAP[c] || c))
  );
  bot.command("mock", (ctx) =>
    cmdText(ctx, (t) =>
      [...t]
        .map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase()))
        .join("")
    )
  );
  bot.command("emojify", (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /emojify <text>");
    let out = t.replace(/[.,!?]+/g, " ").replace(/\s+/g, " ").trim();
    out = out.replace(new RegExp(Object.keys(EMOJI_MAP).join("|"), "gi"), (m) => EMOJI_MAP[m.toLowerCase()]);
    return ctx.reply(out.trim());
  });
}

function cmdText(ctx, fn) {
  const t = argText(ctx);
  if (!t) return ctx.reply("Provide some text.");
  const out = fn(t);
  if (!out.trim()) return ctx.reply("No result.");
  return ctx.reply(out);
}

function cmdHash(ctx, algo) {
  const t = argText(ctx);
  if (!t) return ctx.reply("Usage: /" + algo + " <text>");
  return ctx.reply(createHash(algo).update(t).digest("hex"));
}
