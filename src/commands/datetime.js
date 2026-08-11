import { reg, argText } from "../utils.js";

const ZONES = {
  tehran: "Asia/Tehran",
  istanbul: "Europe/Istanbul",
  london: "Europe/London",
  newyork: "America/New_York",
  tokyo: "Asia/Tokyo",
  dubai: "Asia/Dubai",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  losangeles: "America/Los_Angeles",
  sydney: "Australia/Sydney",
};

export default function register(bot) {
  reg("now", { desc: "Current date and time", group: "datetime" });
  reg("date", { desc: "Today's date", group: "datetime" });
  reg("time", { usage: "[zone]", desc: "Time in a timezone (tehran, london, tokyo, ...)", group: "datetime" });
  reg("age", { usage: "<YYYY-MM-DD>", desc: "Calculate age", group: "datetime" });
  reg("countdown", { usage: "<YYYY-MM-DD>", desc: "Days until a date", group: "datetime" });

  bot.command("now", (ctx) => {
    const d = new Date();
    return ctx.reply(`${formatFull(d)}\nUnix: <code>${Math.floor(d.getTime() / 1000)}</code>`, { parse_mode: "HTML" });
  });

  bot.command("date", (ctx) => ctx.reply(formatFull(new Date())));

  bot.command("time", (ctx) => {
    const name = argText(ctx).toLowerCase().replace(/[\s_]/g, "");
    const zone = ZONES[name];
    if (!zone) {
      const list = Object.keys(ZONES).join(", ");
      return ctx.reply("Usage: /time <zone>\nAvailable zones: " + list);
    }
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return ctx.reply(`Time in ${name}: <b>${fmt.format(new Date())}</b>`, { parse_mode: "HTML" });
  });

  bot.command("age", (ctx) => {
    const raw = argText(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ctx.reply("Usage: /age YYYY-MM-DD");
    const birth = new Date(raw + "T00:00:00");
    if (isNaN(birth)) return ctx.reply("Invalid date.");
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    let days = now.getDate() - birth.getDate();
    if (days < 0) {
      months--;
      const prev = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      days += prev;
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    return ctx.reply(`You are <b>${years}</b> years, <b>${months}</b> months and <b>${days}</b> days old.`, {
      parse_mode: "HTML",
    });
  });

  bot.command("countdown", (ctx) => {
    const raw = argText(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ctx.reply("Usage: /countdown YYYY-MM-DD");
    const target = new Date(raw + "T00:00:00");
    if (isNaN(target)) return ctx.reply("Invalid date.");
    const diff = Math.ceil((target - new Date()) / (1000 * 60 * 60 * 24));
    if (diff > 0) return ctx.reply(`<b>${diff}</b> days until ${raw}.`, { parse_mode: "HTML" });
    if (diff === 0) return ctx.reply("That is today!");
    return ctx.reply(`That was <b>${-diff}</b> days ago.`, { parse_mode: "HTML" });
  });
}

function formatFull(d) {
  return d.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
    " — " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
