import config, { validate } from "./src/config.js";
import { initAI, chat } from "./src/ai.js";
import { MemoryStore } from "./src/memory.js";
import { Store } from "./src/store.js";
import { startScheduler } from "./src/scheduler.js";
import { replyLong } from "./src/utils.js";
import { Bot } from "grammy";
import { isFirstUser, learnFromText, buildChildSystem, getFirstUserCall } from "./src/commands/onboarding.js";

import registerCore from "./src/commands/core.js";
import registerOnboarding from "./src/commands/onboarding.js";
import registerAi from "./src/commands/ai.js";
import registerText from "./src/commands/text.js";
import registerMath from "./src/commands/math.js";
import registerDatetime from "./src/commands/datetime.js";
import registerWeb from "./src/commands/web.js";
import registerFun from "./src/commands/fun.js";
import registerGames from "./src/commands/games.js";
import registerPersonal from "./src/commands/personal.js";
import registerGroup from "./src/commands/group.js";

if (!validate()) process.exit(1);

const bot = new Bot(config.botToken);
initAI();

const memory = new MemoryStore("data/memory.json");
const store = new Store("data/store.json");

const deps = { memory, store };

registerOnboarding(bot, deps);
registerCore(bot, deps);
registerAi(bot, deps);
registerText(bot);
registerMath(bot);
registerDatetime(bot);
registerWeb(bot);
registerFun(bot);
registerGames(bot);
registerPersonal(bot, deps);
registerGroup(bot, deps);

startScheduler(bot, store);

bot.on("message", async (ctx, next) => {
  if (!ctx.from) return next();
  store.touchUser(ctx.from.id);
  store.getChat(ctx.chat.id).messageCount += 1;
  store.save();

  if (ctx.chat.type === "private" && ctx.message.text) {
    const aliasText = store.getUser(ctx.from.id).aliases[ctx.message.text.trim().toLowerCase()];
    if (aliasText) {
      return ctx.reply(aliasText);
    }
  }
  return next();
});

bot.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (!text) return;

  if (ctx.chat.type === "private") {
    return handleChat(ctx, text);
  }

  if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
    if (text.startsWith("/")) return;
    const mentioned = text.includes("@" + ctx.me.username);
    const repliedToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
    if (mentioned || repliedToBot) {
      return handleChat(ctx, text);
    }
    return next();
  }
});

async function handleChat(ctx, text) {
  const id = ctx.from ? ctx.from.id : ctx.chat.id;
  const isChild = isFirstUser(ctx, store);

  if (isChild) {
    const fact = learnFromText(text);
    if (fact) {
      const firstUser = store.data.firstUser;
      if (!firstUser.learned) firstUser.learned = [];
      firstUser.learned.push(fact);
      store.save();
      const call = getFirstUserCall(firstUser);
      return ctx.reply(`${call}! یادم گرفت. از این به بعد اینو یادم می‌مونه: ${fact}`);
    }
  }

  try {
    await ctx.replyWithChatAction("typing");
    memory.push(id, text, "user");
    const system = isChild ? buildChildSystem(store.data.firstUser) : null;
    const answer = await chat(text, memory.get(id).slice(0, -1), system);
    if (!answer) throw new Error("empty response");
    memory.push(id, answer, "assistant");
    await replyLong(answer)(ctx);
  } catch (err) {
    if (err.message === "NO_GEMINI_KEY") {
      return ctx.reply(
        "Smart chat is disabled until GEMINI_API_KEY is set in the .env file.\n" +
          "Get a free key at https://aistudio.google.com, add it, and restart the bot.\n\n" +
          "Meanwhile, try /commands to use the other tools."
      );
    }
    console.error("chat error:", err);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
}

bot.catch((err) => {
  console.error("bot error:", err);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

bot.start();
console.log("MaddyBot is running...");
