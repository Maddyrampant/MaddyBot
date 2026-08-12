import { createHmac } from "node:crypto";
import { InlineKeyboard } from "grammy";
import { reg } from "../utils.js";
import config from "../config.js";
import { GAMES, gameByKey } from "../gamecatalog.js";

export function gameUrl(file, userId, name) {
  const sig = createHmac("sha256", config.botToken).update(String(userId)).digest("hex");
  const qs = `user=${userId}&sig=${sig}` + (name ? `&name=${encodeURIComponent(name)}` : "");
  return `${config.webappUrl}/games/${file}?${qs}`;
}

const BOTFATHER_HINT =
  "این بازی هنوز در @BotFather ثبت نشده است.\n" +
  "برای هر بازی یک بار در @BotFather دستور /newgame را بزن و short name این بازی را بده:\n" +
  GAMES.map((g) => `${g.key} — ${g.title} ${g.emoji}`).join("\n");

function gameMenuKb() {
  const kb = new InlineKeyboard();
  GAMES.forEach((g, i) => {
    kb.text(`${g.emoji} ${g.title}`, "gmg:" + g.key);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

function leaderboardText(store, key, title) {
  const top = store.topGameScores(key, 10);
  const lines = [`🏆 رکوردهای ${title}`];
  if (!top.length) {
    lines.push("هنوز رکوردی ثبت نشده است.");
  } else {
    lines.push(...top.map((t) => `${t.rank}. ${t.name || "کاربر"} — <b>${t.score}</b>`));
  }
  return lines.join("\n");
}

export default function register(bot, { store }) {
  reg("games", { desc: "HTML5 arcade games with high scores", group: "games" });
  reg("game", { usage: "<name>", desc: "Play an HTML5 game (snake, tetris, 2048, ...)", group: "games" });
  reg("top", { usage: "<name>", desc: "High-score table of a game", group: "games" });

  bot.command("games", async (ctx) => {
    await ctx.reply("🎮 بازی‌های مادی‌بات:\nروی بازی بزن تا ساخته شود و Play را بزن.", {
      reply_markup: gameMenuKb(),
    });
  });

  bot.command("game", async (ctx) => {
    const key = (ctx.match || "").trim().toLowerCase();
    if (!key) {
      return ctx.reply(
        "روش استفاده: /game <name>\n" +
          "بازی‌ها: " +
          GAMES.map((g) => `${g.key} (${g.title} ${g.emoji})`).join("، ")
      );
    }
    const game = gameByKey(key);
    if (!game) return ctx.reply("بازی ناشناخته. بازی‌ها: " + GAMES.map((g) => g.key).join("، "));
    try {
      await ctx.replyWithGame(game.key, {
        reply_markup: new InlineKeyboard().text("🔝 رکوردها", "topg:" + game.key),
      });
    } catch {
      return ctx.reply(BOTFATHER_HINT);
    }
  });

  bot.command("top", async (ctx) => {
    const key = (ctx.match || "").trim().toLowerCase();
    const game = key ? gameByKey(key) : GAMES[0];
    if (!key) {
      return ctx.reply("روش استفاده: /top <name>\n" + "بازی‌ها: " + GAMES.map((g) => g.key).join("، "));
    }
    if (!game) return ctx.reply("بازی ناشناخته.");
    return ctx.reply(leaderboardText(store, game.key, `${game.emoji} ${game.title}`), {
      parse_mode: "HTML",
    });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("gmg:")) {
      const game = gameByKey(data.split(":")[1]);
      if (!game) return ctx.answerCallbackQuery({ text: "بازی ناشناخته." });
      await ctx.answerCallbackQuery();
      try {
        await ctx.api.sendGame(ctx.chat.id, game.key, {
          reply_markup: new InlineKeyboard().text("🔝 رکوردها", "topg:" + game.key),
        });
      } catch {
        return ctx.reply(BOTFATHER_HINT);
      }
      return;
    }
    if (data.startsWith("topg:")) {
      const game = gameByKey(data.split(":")[1]);
      if (!game) return ctx.answerCallbackQuery({ text: "بازی ناشناخته." });
      await ctx.answerCallbackQuery();
      return ctx.reply(leaderboardText(store, game.key, `${game.emoji} ${game.title}`), {
        parse_mode: "HTML",
      });
    }
    return next();
  });

  bot.on("callback_query:game_short_name", async (ctx) => {
    const shortName = ctx.callbackQuery.game_short_name;
    const game = gameByKey(shortName);
    if (!game) return ctx.answerCallbackQuery({ text: "بازی ناشناخته." });
    const from = ctx.callbackQuery.from;
    const name = from.first_name || from.username || "";
    const url = gameUrl(game.file, from.id, name);
    return ctx.answerCallbackQuery({ url });
  });
}
