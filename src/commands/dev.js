import { reg, argText, clamp, pick, setupHint, escapeHtml } from "../utils.js";
import { singlePrompt } from "../ai.js";

const MORSE = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---",
  k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-",
  u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....",
  "7": "--...", "8": "---..", "9": "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--",
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const PHRASE_WORDS = ["apple", "river", "stone", "cloud", "silver", "tiger", "ocean", "mountain", "light", "forest", "falcon", "bridge", "winter", "ember", "nectar", "orbit", "canyon", "meadow", "thunder", "willow"];

export default function register(bot) {
  reg("json", { usage: "<json>", desc: "Validate and format JSON", group: "dev" });
  reg("color", { usage: "<hex|rgb|hsl>", desc: "Color converter", group: "dev" });
  reg("bytes", { usage: "<n> [unit]", desc: "Human-readable bytes", group: "dev" });
  reg("epoch", { usage: "[timestamp]", desc: "Convert unix time <-> date", group: "dev" });
  reg("duration", { usage: "<seconds>", desc: "Format a duration", group: "dev" });
  reg("pwstrength", { usage: "<password>", desc: "Estimate password strength", group: "dev" });
  reg("cron", { usage: "<cron expr>", desc: "Describe a cron expression", group: "dev" });
  reg("sql", { usage: "<request>", desc: "Write a SQL query", group: "dev" });
  reg("code", { usage: "<request>", desc: "Write or explain code", group: "dev" });
  reg("regex", { usage: "/pattern/ <text>", desc: "Test a regex pattern", group: "dev" });
  reg("morse", { usage: "<text>", desc: "Text <-> Morse code", group: "dev" });
  reg("caesar", { usage: "<shift> <text>", desc: "Caesar cipher", group: "dev" });
  reg("passphrase", { usage: "[words]", desc: "Generate a random passphrase", group: "dev" });

  bot.command("json", (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /json <json text>");
    try {
      const parsed = JSON.parse(t);
      return ctx.reply("<pre>" + escapeHtml(JSON.stringify(parsed, null, 2).slice(0, 3900)) + "</pre>", {
        parse_mode: "HTML",
      });
    } catch (e) {
      return ctx.reply("Invalid JSON: " + e.message);
    }
  });

  bot.command("color", (ctx) => {
    const input = argText(ctx).trim();
    if (!input) return ctx.reply("Usage: /color #ff8800 or rgb(255,136,0) or hsl(30,100%,50%)");
    let m = input.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = [...h].map((c) => c + c).join("");
      return ctx.reply(colorLines(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)));
    }
    m = input.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (m) return ctx.reply(colorLines(+m[1], +m[2], +m[3]));
    m = input.match(/^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i);
    if (m) {
      const [r, g, b] = hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
      return ctx.reply(colorLines(r, g, b));
    }
    return ctx.reply("Unsupported color format. Try #ff8800, rgb(255,136,0), or hsl(30,100%,50%).");
  });

  bot.command("bytes", (ctx) => {
    const m = argText(ctx).match(/^(\d+(?:\.\d+)?)\s*([kmgt]?b)?$/i);
    if (!m) return ctx.reply("Usage: /bytes 5242880 or /bytes 5 mb");
    const unit = (m[2] || "b").toLowerCase();
    const mult = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };
    let v = parseFloat(m[1]) * (mult[unit] || 1);
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return ctx.reply(`${parseFloat(m[1]) * (mult[unit] || 1)} bytes = ${v.toFixed(2)} ${units[i]}`);
  });

  bot.command("epoch", (ctx) => {
    const t = argText(ctx).trim();
    if (!t) {
      const now = Math.floor(Date.now() / 1000);
      return ctx.reply(`Now: ${now}\nHuman: ${new Date().toISOString()}`);
    }
    const n = parseInt(t, 10);
    if (isNaN(n) || (!t.startsWith("-") && !/^\d+$/.test(t))) return ctx.reply("Usage: /epoch <unix seconds>");
    const d = new Date(n * 1000);
    if (isNaN(d)) return ctx.reply("Invalid timestamp.");
    return ctx.reply(`Unix: ${n}\nUTC: ${d.toISOString()}\nLocal: ${d.toLocaleString("en-GB")}`);
  });

  bot.command("duration", (ctx) => {
    const s = parseFloat(argText(ctx));
    if (isNaN(s) || s < 0) return ctx.reply("Usage: /duration <seconds>");
    const units = [
      [Math.floor(s / 31536000), "year(s)"], [Math.floor((s % 31536000) / 86400), "day(s)"],
      [Math.floor((s % 86400) / 3600), "hour(s)"], [Math.floor((s % 3600) / 60), "minute(s)"],
      [Math.floor(s % 60), "second(s)"],
    ];
    const parts = units.filter(([v]) => v > 0).map(([v, u]) => `${v} ${u}`);
    return ctx.reply(parts.length ? parts.join(", ") : "0 seconds");
  });

  bot.command("pwstrength", (ctx) => {
    const p = argText(ctx);
    if (!p) return ctx.reply("Usage: /pwstrength <password>");
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26;
    if (/[A-Z]/.test(p)) pool += 26;
    if (/\d/.test(p)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(p)) pool += 32;
    const entropy = pool ? Math.round(p.length * Math.log2(pool)) : 0;
    const crack = entropy <= 35 ? "instant" : entropy <= 55 ? "seconds" : entropy <= 75 ? "days" : entropy <= 95 ? "years" : "centuries";
    const levels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong"];
    const score = Math.min(levels.length - 1, Math.round(entropy / 20));
    return ctx.reply(`Length: ${p.length}\nEntropy: ~${entropy} bits\nStrength: ${levels[score]}\nEstimated time to crack: ${crack}`);
  });

  bot.command("cron", (ctx) => {
    const expr = argText(ctx);
    if (!expr) return ctx.reply("Usage: /cron '0 9 * * 1'  (5 fields: minute hour day month weekday)");
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return ctx.reply("Only 5-field cron is supported: minute hour day-of-month month weekday");
    const [min, hour, dom, mon, dow] = parts;
    return ctx.reply(
      [
        describeCronField(min, "minute"),
        describeCronField(hour, "hour"),
        describeCronField(dom, "day of month"),
        describeCronField(mon, "month"),
        describeCronField(dow, "weekday"),
      ].join("\n")
    );
  });

  bot.command("sql", async (ctx) => {
    const req = argText(ctx);
    if (!req) return ctx.reply("Usage: /sql <what you need>");
    await ctx.replyWithChatAction("typing");
    try {
      const out = await singlePrompt("Write a precise SQL query for: " + req + ". Explain it briefly in Persian. Use standard SQL.");
      return ctx.reply(out);
    } catch (err) {
      return ctx.reply(err.message === "NO_GEMINI_KEY" ? setupHint() : "Could not generate.");
    }
  });

  bot.command("code", async (ctx) => {
    const req = argText(ctx);
    if (!req) return ctx.reply("Usage: /code <what code you need>");
    await ctx.replyWithChatAction("typing");
    try {
      const out = await singlePrompt("Write clean, well-explained code for: " + req + ". Include a short Persian explanation.");
      return ctx.reply(out);
    } catch (err) {
      return ctx.reply(err.message === "NO_GEMINI_KEY" ? setupHint() : "Could not generate.");
    }
  });

  bot.command("regex", (ctx) => {
    const m = argText(ctx).match(/^(\/(?:\\\/|[^\/])+\/[a-z]*)\s+([\s\S]+)$/);
    if (!m) return ctx.reply("Usage: /regex /pattern/g <test text>");
    try {
      const lastSlash = m[1].lastIndexOf("/");
      const body = m[1].slice(1, lastSlash);
      const flags = m[1].slice(lastSlash + 1);
      const re = new RegExp(body, flags);
      const matches = m[2].match(re);
      return ctx.reply(`Pattern: ${m[1]}\nMatched: ${matches ? "yes" : "no"}${matches ? "\nResult: " + JSON.stringify(matches).slice(0, 300) : ""}`);
    } catch (e) {
      return ctx.reply("Invalid regex: " + e.message);
    }
  });

  bot.command("morse", (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /morse <text> - dots and dashes are decoded");
    if (/^[.\-\s\/]+$/.test(t.trim())) {
      const decoded = t
        .trim()
        .split("/")
        .map((w) => w.trim().split(/\s+/).filter(Boolean).map((s) => MORSE_REV[s] || "?").join(""))
        .join(" ");
      return ctx.reply("Decoded: " + decoded);
    }
    const encoded = t
      .toLowerCase()
      .split("")
      .map((c) => (c === " " ? "/" : MORSE[c] || ""))
      .filter((v) => v !== "")
      .join(" ");
    return ctx.reply(encoded);
  });

  bot.command("caesar", (ctx) => {
    const m = argText(ctx).match(/^(-?\d+)\s+([\s\S]+)$/);
    if (!m) return ctx.reply("Usage: /caesar <shift> <text>");
    const shift = (((parseInt(m[1], 10) % 26) + 26) % 26);
    const out = m[2]
      .split("")
      .map((ch) => {
        const code = ch.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + shift) % 26) + 65);
        if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + shift) % 26) + 97);
        return ch;
      })
      .join("");
    return ctx.reply(out);
  });

  bot.command("passphrase", (ctx) => {
    const n = clamp(parseInt(argText(ctx), 10) || 5, 2, 12);
    const words = Array.from({ length: n }, () => pick(PHRASE_WORDS));
    const sep = pick(["-", "_", ".", " "]);
    return ctx.reply("<code>" + words.join(sep) + "</code>\n" + n + " random words - easy to remember, hard to guess.", {
      parse_mode: "HTML",
    });
  });
}

function colorLines(r, g, b) {
  const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const hsl = rgbToHsl(r, g, b);
  return `HEX: ${hex}\nRGB: ${r}, ${g}, ${b}\nHSL: ${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%`;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255));
}

function describeCronField(field, unit) {
  if (field === "*") return `every ${unit}`;
  if (/^\*\//.test(field)) {
    const n = parseInt(field.slice(2), 10);
    return `every ${n} ${unit}${n > 1 ? "s" : ""}`;
  }
  if (field.includes(",")) return `on ${field.split(",").join(", ")} of ${unit}`;
  if (field.includes("-")) {
    const [a, b] = field.split("-");
    return `from ${a} to ${b} of ${unit}`;
  }
  return `at ${field} of ${unit}`;
}
