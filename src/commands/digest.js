import { reg, argText } from "../utils.js";

export default function register(bot, deps) {
  const { store } = deps;

  reg("digest", { usage: "<HH:MM|off>", desc: "Daily report at a set time (e.g. /digest 08:00)", group: "productivity" });

  bot.command("digest", async (ctx) => {
    const id = ctx.from ? ctx.from.id : null;
    if (!id) return ctx.reply("لطفاً از داخل تلگرام استفاده کن.");
    const arg = argText(ctx).trim().toLowerCase();
    const user = store.getUser(id);
    if (arg === "off") {
      user.digest = { enabled: false };
      store.save();
      return ctx.reply("🚫 گزارش روزانه خاموش شد.");
    }
    const m = arg.match(/^([0-2]?\d):([0-5]\d)$/);
    if (!m) return ctx.reply("روش استفاده:\n/digest 08:00  (فعال‌سازی)\n/digest off  (خاموش)");
    const time = String(m[1]).padStart(2, "0") + ":" + m[2];
    user.digest = { enabled: true, time, lastSent: "" };
    store.save();
    await ctx.reply(`✅ گزارش روزانه هر روز ساعت ${time} برایت ارسال می‌شود.`);
  });
}
