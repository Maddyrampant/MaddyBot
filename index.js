import config, { validate } from "./src/config.js";
import { initAI, chat, CHAT_SYSTEM } from "./src/ai.js";
import { MemoryStore, buildContext, addMessage, extractFacts } from "./src/memory.js";
import { Store } from "./src/store.js";
import { startScheduler } from "./src/scheduler.js";
import { replyLong } from "./src/utils.js";
import { getDb } from "./src/db.js";
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
import registerGame from "./src/commands/game.js";
import registerPersonal from "./src/commands/personal.js";
import registerGroup from "./src/commands/group.js";
import registerProductivity from "./src/commands/productivity.js";
import registerFinance from "./src/commands/finance.js";
import registerHealth from "./src/commands/health.js";
import registerKnowledge from "./src/commands/knowledge.js";
import registerDev from "./src/commands/dev.js";
import registerExtra from "./src/commands/extra.js";
import registerAgent from "./src/commands/agent.js";
import registerMemory from "./src/commands/memory.js";
import registerWebapp, { sendWebapp } from "./src/commands/webapp.js";
import registerDownload from "./src/commands/download.js";
import registerImage from "./src/commands/image.js";
import registerVoice from "./src/commands/voice.js";
import registerDocs from "./src/commands/docs.js";
import registerPayments from "./src/commands/payments.js";
import registerDigest from "./src/commands/digest.js";
import registerAdmin from "./src/commands/admin.js";
import { registerMenu } from "./src/menu.js";
import { startWebApp } from "./src/webapp.js";

if (!validate()) process.exit(1);

getDb();

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
registerGame(bot, deps);
registerPersonal(bot, deps);
registerGroup(bot, deps);
registerProductivity(bot, deps);
registerFinance(bot, deps);
registerHealth(bot, deps);
registerKnowledge(bot);
registerDev(bot);
registerExtra(bot);
registerAgent(bot);
registerMemory(bot);
registerWebapp(bot);
registerDownload(bot);
registerImage(bot);
registerVoice(bot, deps);
registerDocs(bot);
registerPayments(bot, deps);
registerDigest(bot, deps);
registerAdmin(bot);

registerMenu(bot, { sendWebapp });

startScheduler(bot, store);

bot.on("message", async (ctx, next) => {
  if (!ctx.from) return next();
  store.touchUser(ctx.from.id);
  store.getChat(ctx.chat.id).messageCount += 1;
  if (ctx.chat.type === "private") {
    store.getUser(ctx.from.id).lastChatId = ctx.chat.id;
  }
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
    addMessage(id, "user", text);
    let system = isChild ? buildChildSystem(store.data.firstUser) : CHAT_SYSTEM;
    const mem = await buildContext(id, text).catch(() => null);
    if (mem && (mem.facts || mem.summary)) {
      const extra = [];
      if (mem.summary) extra.push(`Ongoing conversation summary:\n${mem.summary}`);
      if (mem.facts) extra.push(`Long-term memories about this person:\n${mem.facts}`);
      system = (system || "You are Madellin, a smart assistant.") + "\n\n" + extra.join("\n\n");
    }
    const answer = await chat(text, memory.get(id).slice(0, -1), system);
    if (!answer) throw new Error("empty response");
    memory.push(id, answer, "assistant");
    addMessage(id, "assistant", answer);
    void extractFacts(id, [text, answer]);
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

async function setupWebApp() {
  if (!config.webappEnabled) return;
  try {
    startWebApp({ store, memory, bot });
  } catch (err) {
    console.error("WebApp failed to start:", err.message);
  }
  try {
    await bot.api.setChatMenuButton({
      menuButton: { type: "web_app", text: "🌐 وباپ", web_app: { url: config.webappUrl } },
    });
    await bot.api.setMyCommands([
      { command: "start", description: "صفحه اصلی و منو" },
      { command: "webapp", description: "نسخه تصویری (وباپ)" },
      { command: "ask", description: "گفتگو با دستیار" },
      { command: "dl", description: "دانلود ویدیو/مدیا از هر سایتی" },
      { command: "yt", description: "دانلود ویدیو از یوتیوب" },
      { command: "insta", description: "دانلود از اینستاگرام" },
      { command: "mp3", description: "دریافت صوت از ویدیو" },
      { command: "commands", description: "لیست همه فرمان‌ها" },
      { command: "help", description: "راهنما" },
      { command: "weather", description: "آب‌وهوا" },
      { command: "qr", description: "ساخت QR" },
      { command: "translate", description: "ترجمه" },
      { command: "todo", description: "کارهای من" },
      { command: "memories", description: "خاطرات من" },
    ]);
  } catch (err) {
    console.error("setChatMenuButton/setMyCommands failed:", err.message);
  }
}

bot.start();
setupWebApp();
console.log("MaddyBot is running...");
