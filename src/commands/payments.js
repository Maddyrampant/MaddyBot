import { InlineKeyboard } from "grammy";
import { reg, isOwnerId, fmtNum } from "../utils.js";

export default function register(bot, deps) {
  const { store } = deps;

  reg("donate", { desc: "Support MaddyBot with Telegram Stars", group: "extra" });
  reg("donations", { desc: "Show the donations log (owner only)", group: "admin" });

  bot.command("donate", async (ctx) => {
    const kb = new InlineKeyboard()
      .text("⭐ 50", "pay:50")
      .text("⭐ 100", "pay:100")
      .text("⭐ 250", "pay:250")
      .row()
      .text("⭐ 500", "pay:500")
      .text("⭐ 1000", "pay:1000")
      .text("✖️", "pay:close");
    await ctx.reply(
      "💛 اگر از مادی‌بات خوشت می‌آید، می‌توانی با ستاره (Stars) حمایتم کنی — کاملاً اختیاری.\n" +
        "هر هدیه، یک قهوه و انرژی برای ادامهٔ کار است ☕",
      { reply_markup: kb }
    );
  });

  bot.command("donations", async (ctx) => {
    const id = ctx.from ? ctx.from.id : null;
    if (!id || !isOwnerId(id)) return ctx.reply("فقط صاحب ربات می‌تواند این را ببیند.");
    const entries = [];
    for (const uid of Object.keys(store.data.users || {})) {
      for (const d of store.data.users[uid].donations || []) {
        entries.push({ uid, ...d });
      }
    }
    if (!entries.length) return ctx.reply("هنوز هدیه‌ای دریافت نشده.");
    entries.sort((a, b) => b.date - a.date);
    const total = entries.reduce((s, e) => s + e.amount, 0);
    const lines = entries.slice(0, 20).map(
      (e) =>
        `• ${fmtNum(e.amount)} ${e.currency === "XTR" ? "⭐" : e.currency} — ` +
        `${new Date(e.date).toLocaleString("fa-IR")} (user ${e.uid})`
    );
    await ctx.reply(`💛 مجموع هدایا: ${fmtNum(total)} ⭐\n\n${lines.join("\n")}`);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data || "";
    if (!data.startsWith("pay:")) return next();
    await ctx.answerCallbackQuery().catch(() => {});
    if (data === "pay:close") return ctx.deleteMessage().catch(() => {});
    const amount = Math.floor(Number(data.slice(4)));
    if (!amount || amount <= 0) return;
    const payload = "donate_" + amount + "_" + (ctx.from ? ctx.from.id : 0);
    const kb = new InlineKeyboard().text("✖️ بستن", "pay:close");
    try {
      await ctx.api.sendInvoice(ctx.chat.id, {
        title: "حمایت از مادی‌بات",
        description: "یک قهوه برای مادلین! 💛",
        payload,
        currency: "XTR",
        prices: [{ label: "Telegram Stars", amount }],
        reply_markup: kb,
      });
    } catch (err) {
      await ctx.reply(
        "ارسال فاکتور ممکن نشد. مطمئن شوید ربات ستاره دریافت می‌کند:\n" +
          "@BotFather → Payments → Telegram Stars را فعال کنید."
      );
    }
  });

  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true).catch(() => {});
  });

  bot.on("message:successful_payment", async (ctx) => {
    const pay = ctx.message.successful_payment;
    const id = ctx.from ? ctx.from.id : null;
    if (id && pay) {
      const user = store.getUser(id);
      user.donations = user.donations || [];
      user.donations.push({
        amount: pay.total_amount,
        currency: pay.currency,
        date: Date.now(),
        payload: pay.invoice_payload || "",
      });
      store.save();
    }
    await ctx.reply("🎉 ممنون از حمایتت! انرژی گرفتم و بهتر کار می‌کنم. 💛");
  });
}
