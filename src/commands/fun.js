import figlet from "figlet";
import { getJSON, postJSON } from "../http.js";
import { reg, argText, pick, randomInt } from "../utils.js";

const BALL = [
  "Yes", "No", "Maybe", "Ask again later", "Definitely", "I doubt it",
  "Signs point to yes", "Cannot predict now", "Outlook good", "Don't count on it",
];
const FLIP_MAP = {
  a: "\u0250", b: "q", c: "\u0254", d: "p", e: "\u01DD", f: "\u028F", g: "\u0253",
  h: "\u0265", i: "\u0131", j: "\u027E", k: "\u029E", l: "l", m: "\u026F", n: "u",
  o: "o", p: "d", q: "b", r: "\u0279", s: "s", t: "\u0287", u: "n", v: "\u028C",
  w: "\u028D", x: "x", y: "\u028E", z: "z",
};
const SLOT = ["\u{1F346}", "\u{1F352}", "\u{1F353}", "\u{1F349}", "\u{1F34E}", "\u{1F34A}", "\u{1F33D}", "\u{1F350}"];
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];

export default function register(bot) {
  reg("8ball", { usage: "<question>", desc: "Magic 8-ball answer", group: "fun" });
  reg("scramble", { usage: "<text>", desc: "Scramble the letters", group: "fun" });
  reg("cat", { desc: "Random cat photo", group: "fun" });
  reg("dog", { desc: "Random dog photo", group: "fun" });
  reg("meme", { desc: "Random meme", group: "fun" });
  reg("ascii", { usage: "<text>", desc: "ASCII art banner", group: "fun" });
  reg("horoscope", { usage: "<sign>", desc: "Daily horoscope", group: "fun" });
  reg("lucky", { desc: "Your lucky number", group: "fun" });
  reg("flip", { usage: "<text>", desc: "Flip text upside down", group: "fun" });
  reg("slot", { desc: "Slot machine", group: "fun" });

  bot.command("8ball", (ctx) => {
    if (!argText(ctx)) return ctx.reply("Usage: /8ball <your question>");
    return ctx.reply("\u{1F52E} " + pick(BALL));
  });

  bot.command("scramble", (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /scramble <text>");
    const out = t
      .split(" ")
      .map((w) => (w.length > 2 ? w[0] + shuffle(w.slice(1, -1)) + w[w.length - 1] : w))
      .join(" ");
    return ctx.reply(out);
  });

  bot.command("cat", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON("https://api.thecatapi.com/v1/images/search");
      await ctx.replyWithPhoto(data[0].url);
    } catch {
      await ctx.reply("Could not fetch a cat right now.");
    }
  });

  bot.command("dog", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON("https://dog.ceo/api/breeds/image/random");
      await ctx.replyWithPhoto(data.message);
    } catch {
      await ctx.reply("Could not fetch a dog right now.");
    }
  });

  bot.command("meme", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON("https://meme-api.com/gimme");
      await ctx.replyWithPhoto(data.url, { caption: data.title });
    } catch {
      await ctx.reply("Could not fetch a meme right now.");
    }
  });

  bot.command("ascii", async (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /ascii <text>");
    await ctx.replyWithChatAction("typing");
    try {
      const art = await figlet.text(t, { font: "Standard" });
      await ctx.reply("<pre>" + escapeHtml(art) + "</pre>", { parse_mode: "HTML" });
    } catch {
      await ctx.reply("Could not generate ASCII art.");
    }
  });

  bot.command("horoscope", async (ctx) => {
    const sign = argText(ctx).toLowerCase();
    if (!SIGNS.includes(sign)) return ctx.reply("Usage: /horoscope <sign>\nSigns: " + SIGNS.join(", "));
    await ctx.replyWithChatAction("typing");
    try {
      const data = await postJSON(`https://aztro.sameerkumar.website/?sign=${sign}&day=today`);
      return ctx.reply(
        `<b>${data.sign} horoscope</b>\n${data.description}\n\nLucky number: <b>${data.lucky_number}</b>\nCompatibility: <b>${data.compatibility}</b>`,
        { parse_mode: "HTML" }
      );
    } catch {
      return ctx.reply("Could not fetch the horoscope.");
    }
  });

  bot.command("lucky", (ctx) => {
    const n = randomInt(1, 100);
    const luck = n > 80 ? "Excellent" : n > 60 ? "Good" : n > 40 ? "Average" : n > 20 ? "Poor" : "Terrible";
    return ctx.reply(`Your lucky number: <b>${n}</b>\nLuck level: ${luck}`, { parse_mode: "HTML" });
  });

  bot.command("flip", (ctx) => {
    const t = argText(ctx);
    if (!t) return ctx.reply("Usage: /flip <text>");
    const out = [...t]
      .map((c) => FLIP_MAP[c.toLowerCase()] || c)
      .reverse()
      .join("");
    return ctx.reply(out);
  });

  bot.command("slot", (ctx) => {
    const reels = Array.from({ length: 3 }, () => pick(SLOT));
    const win = reels.every((r) => r === reels[0]);
    return ctx.reply(
      `\u{1F3B0} ${reels.join(" ")} \u{1F3B0}\n${win ? "Jackpot! You win!" : "No luck this time."}`
    );
  });
}

function shuffle(str) {
  return [...str].sort(() => Math.random() - 0.5).join("");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
