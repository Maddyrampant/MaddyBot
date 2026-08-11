import { reg, argText, pick, randomInt } from "../utils.js";
import { getJSON } from "../http.js";

const COMPLIMENTS = [
  "You have a genuinely kind heart.",
  "Your ideas are sharper than you think.",
  "The world is better because you are in it.",
  "You handle hard things with quiet grace.",
  "People are lucky to have you.",
  "Your sense of humor is underrated.",
  "You make hard work look easy.",
  "You are braver than you give yourself credit for.",
  "You listen in a way that makes people feel safe.",
  "You are the reason someone smiled today.",
];

export default function register(bot) {
  reg("distance", { usage: "<city A> to <city B>", desc: "Distance between two cities", group: "extra" });
  reg("poll", { usage: "<question> | <option1> | <option2> ...", desc: "Create a poll", group: "extra" });
  reg("greeting", { desc: "Time-based greeting", group: "extra" });
  reg("compliment", { desc: "A sincere compliment", group: "extra" });
  reg("country", { usage: "<name>", desc: "Country facts", group: "extra" });
  reg("flag", { usage: "<country>", desc: "Country flag image", group: "extra" });
  reg("whoami", { desc: "Full context about you and this chat", group: "extra" });
  reg("lotto", { desc: "Random lottery numbers", group: "extra" });

  bot.command("distance", async (ctx) => {
    const m = argText(ctx).match(/^(.+?)\s+(?:to|->|تا|به)\s+(.+)$/i);
    if (!m) return ctx.reply("Usage: /distance <city A> to <city B>");
    await ctx.replyWithChatAction("typing");
    try {
      const [a, b] = await Promise.all([geo(m[1].trim()), geo(m[2].trim())]);
      if (!a || !b) return ctx.reply("Could not find one of the locations.");
      return ctx.reply(`${a.name} -> ${b.name}\nDistance: ~${Math.round(haversine(a.lat, a.lon, b.lat, b.lon))} km`);
    } catch {
      return ctx.reply("Could not compute the distance.");
    }
  });

  bot.command("poll", async (ctx) => {
    const parts = argText(ctx).split("|").map((s) => s.trim());
    if (parts.length < 3) return ctx.reply("Usage: /poll <question> | <option1> | <option2> | [option3] ...");
    const [question, ...options] = parts;
    try {
      await ctx.replyWithPoll(question, options.slice(0, 10), { is_anonymous: false });
    } catch {
      return ctx.reply("Could not create the poll. Make sure the question and options are valid.");
    }
  });

  bot.command("greeting", (ctx) => {
    const h = new Date().getHours();
    const g = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night";
    return ctx.reply(`${g}! I hope your day is going well.`);
  });

  bot.command("compliment", (ctx) => ctx.reply(pick(COMPLIMENTS)));

  bot.command("country", async (ctx) => {
    const name = argText(ctx);
    if (!name) return ctx.reply("Usage: /country <name>");
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON(
        `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fields=name,capital,region,subregion,population,area,currencies,languages,flags`
      );
      const c = data[0];
      if (!c) return ctx.reply("Country not found.");
      const cur = Object.values(c.currencies || {}).map((x) => x.name).join(", ");
      const langs = Object.values(c.languages || {}).join(", ");
      return ctx.reply(
        `${c.flags.emoji} ${c.name.common}\nCapital: ${c.capital?.[0] || "-"}\n` +
          `Region: ${c.region}${c.subregion ? " / " + c.subregion : ""}\n` +
          `Population: ${(c.population || 0).toLocaleString("en-US")}\nArea: ${(c.area || 0).toLocaleString("en-US")} km2\n` +
          `Currency: ${cur || "-"}\nLanguages: ${langs || "-"}`
      );
    } catch {
      return ctx.reply("Country not found.");
    }
  });

  bot.command("flag", async (ctx) => {
    const name = argText(ctx);
    if (!name) return ctx.reply("Usage: /flag <country>");
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fields=name,flags`);
      await ctx.replyWithPhoto(data[0].flags.png, { caption: data[0].name.common });
    } catch {
      return ctx.reply("Country not found.");
    }
  });

  bot.command("whoami", (ctx) => {
    const from = ctx.from || {};
    return ctx.reply(
      `User: ${from.first_name || ""}${from.last_name ? " " + from.last_name : ""}${from.username ? " (@" + from.username + ")" : ""}\n` +
        `User ID: <code>${from.id}</code>\n` +
        `Chat: ${ctx.chat.type} (${ctx.chat.title || ctx.chat.first_name || ctx.chat.id})\nChat ID: <code>${ctx.chat.id}</code>\n` +
        `Time: ${new Date().toLocaleString("en-GB")}\nLanguage: ${from.language_code || "?"}\nPremium: ${from.is_premium ? "yes" : "no"}`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("lotto", (ctx) => {
    const nums = new Set();
    while (nums.size < 6) nums.add(randomInt(1, 49));
    const main = [...nums].sort((a, b) => a - b);
    return ctx.reply(`Your lottery numbers:\n${main.join(" - ")}\nStar ball: ${randomInt(1, 10)}\nGood luck!`);
  });
}

async function geo(q) {
  const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&format=json`);
  const r = d.results && d.results[0];
  return r ? { name: r.name, lat: r.latitude, lon: r.longitude } : null;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
