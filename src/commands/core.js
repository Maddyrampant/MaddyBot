import { reg, registry, argText, allGroups, groupLabel } from "../utils.js";
import { mainMenu, groupMenu, cmdView, replyKeyboard, MAIN_TEXT, showMain } from "../menu.js";

const bootTime = Date.now();

export default function register(bot, { store }) {
  reg("start", { desc: "Welcome message", group: "core" });
  reg("help", { usage: "[command]", desc: "List commands or details for one", group: "core" });
  reg("commands", { usage: "[group]", desc: "List all commands", group: "core" });
  reg("id", { desc: "Your ID and current chat ID", group: "core" });
  reg("me", { desc: "Your profile and stats", group: "core" });
  reg("about", { desc: "About MaddyBot", group: "core" });
  reg("stats", { desc: "Bot statistics", group: "core" });
  reg("version", { desc: "Bot version", group: "core" });
  reg("ping", { desc: "Check latency", group: "core" });
  reg("settings", { desc: "Show your settings", group: "core" });
  reg("feedback", { usage: "<text>", desc: "Send feedback to the owner", group: "core" });
  reg("report", { usage: "<text>", desc: "Report an issue", group: "core" });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "سلام! من مادی‌بات هستم 🤖\n" +
        "می‌تونم گفتگو کنم، ترجمه کنم، QR بسازم، بازی کنم، آب‌وهوا رو بگم و کلی کار دیگه.\n" +
        "از دکمه‌های زیر یا Reply Keyboard برای پیمایش استفاده کن.",
      { parse_mode: "HTML", reply_markup: mainMenu(0) }
    );
    await ctx.reply("دکمه‌های سریع برای دسترسی راحت‌تر 👇", { reply_markup: replyKeyboard() });
  });

  bot.command(["help", "commands"], async (ctx) => {
    const arg = argText(ctx).trim().replace(/^\//, "");

    if (arg) {
      const meta = registry[arg];
      if (meta) {
        const view = cmdView(arg);
        return ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.kb });
      }
      const isGroup = allGroups().some(([k]) => k === arg);
      if (isGroup) {
        return ctx.reply(`<b>${groupLabel(arg)}</b>\nدستوری را انتخاب کنید.`, {
          parse_mode: "HTML",
          reply_markup: groupMenu(arg, 0),
        });
      }
      return ctx.reply("فرمان ناشناخته: /" + arg);
    }

    return ctx.reply(MAIN_TEXT, { parse_mode: "HTML", reply_markup: mainMenu(0) });
  });

  bot.command("id", async (ctx) => {
    await ctx.reply(`Your ID: <code>${ctx.from.id}</code>\nChat ID: <code>${ctx.chat.id}</code>`, {
      parse_mode: "HTML",
    });
  });

  bot.command("me", async (ctx) => {
    const user = store.getUser(ctx.from.id);
    const from = ctx.from;
    const lines = [
      `نام: ${from.first_name || "-"}`,
      `یوزرنیم: ${from.username ? "@" + from.username : "-"}`,
      `آیدی: <code>${from.id}</code>`,
      `پیام‌های ارسالی به من: ${user.messageCount}`,
    ];
    if (user.birthday) lines.push(`تولد: ${user.birthday}`);
    if (user.todos.length) lines.push(`کارهای باز: ${user.todos.filter((t) => !t.done).length}`);
    if (user.reminders.length) lines.push(`یادآوری‌های فعال: ${user.reminders.length}`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(
      "مادی‌بات یک دستیار تلگرامی چندمنظوره با بیش از ۱۰۰ فرمان است:\n" +
        "گفتگو، ترجمه، ابزارهای متن، ریاضی، آب‌وهوا، QR، بازی، یادآوری و موارد دیگر."
    );
  });

  bot.command("stats", async (ctx) => {
    const user = store.getUser(ctx.from.id);
    const chat = store.getChat(ctx.chat.id);
    const uptime = Math.floor((Date.now() - bootTime) / 1000);
    await ctx.reply(
      `کاربران شناخته‌شده: <code>${Object.keys(store.data.users).length}</code>\n` +
        `پیام‌های این چت: <code>${chat.messageCount}</code>\n` +
        `پیام‌های شما: <code>${user.messageCount}</code>\n` +
        `زمان فعالیت: <code>${uptime}s</code>`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("version", async (ctx) => {
    await ctx.reply("مادی‌بات نسخهٔ 1.0.0");
  });

  bot.command("ping", async (ctx) => {
    const start = Date.now();
    await ctx.reply("پونگ! 🏓");
    await ctx.reply(`زمان رفت‌وبرگشت: ${Date.now() - start}ms`);
  });

  bot.command("settings", async (ctx) => {
    const s = store.getUser(ctx.from.id).settings;
    await ctx.reply(`تنظیمات شما:\nلحن: <code>${s.tone}</code>\nحالت پاسخ: <code>${s.replyMode}</code>`, {
      parse_mode: "HTML",
    });
  });

  bot.command("feedback", async (ctx) => {
    const text = argText(ctx);
    if (!text) return ctx.reply("روش استفاده: /feedback <بازخورد شما>");
    store.addFeedback(`from ${ctx.from.id}: ${text}`);
    await ctx.reply("ممنون! بازخورد شما ذخیره شد.");
  });

  bot.command("report", async (ctx) => {
    const text = argText(ctx);
    if (!text) return ctx.reply("روش استفاده: /report <توضیح مشکل>");
    store.addFeedback(`REPORT from ${ctx.from.id}: ${text}`);
    await ctx.reply("مشکل ثبت شد. ممنون.");
  });
}
