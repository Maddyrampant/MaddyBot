import { InlineKeyboard } from "grammy";
import { reg } from "../utils.js";
import config from "../config.js";

export async function sendWebapp(ctx) {
  const kb = new InlineKeyboard().webApp("🌐 باز کردن وباپ مادی‌بات", config.webappUrl);
  await ctx.reply("نسخه‌ی تصویری مادی‌بات را باز کن 👇", { reply_markup: kb });
}

export default function register(bot) {
  reg("webapp", { desc: "باز کردن نسخه‌ی تصویری (وباپ)", group: "core" });
  bot.command("webapp", (ctx) => sendWebapp(ctx));
}
