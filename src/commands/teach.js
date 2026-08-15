import { reg, argText } from "../utils.js";
import { TEACH_FIELDS, getTeach, teachAdd, teachClear, teachCount, teachProfile } from "../teach.js";

const FIELD_CMDS = { iam: "i_am", imnot: "i_am_not", recommend: "recommend", good: "good" };

const EXAMPLES = {
  i_am: "من محمد هستم و ربات برنامه‌نویسی می‌سازم",
  i_am_not: "من به بازی‌های آنلاین علاقه ندارم",
  recommend: "بهترین راه‌های درآمد آنلاین را به من پیشنهاد بده",
  good: "کتاب و قهوه را دوست دارم، شب‌ها بهتر کار می‌کنم",
};

function userName(ctx) {
  const f = ctx.from;
  return f ? [f.first_name, f.last_name].filter(Boolean).join(" ") || f.username || "کاربر" : "کاربر";
}

export default function register(bot, deps) {
  for (const [cmd, key] of Object.entries(FIELD_CMDS)) {
    reg(cmd, {
      usage: "<text>",
      desc: "یاد بده: " + TEACH_FIELDS[key].fa,
      group: "personal",
    });
    bot.command(cmd, async (ctx) => {
      const text = argText(ctx);
      if (!text) {
        return ctx.reply(`استفاده: /${cmd} <متن>\nمثال: /${cmd} ${EXAMPLES[key]}`);
      }
      const user = deps.store.getUser(ctx.from.id);
      const res = teachAdd(user, key, text);
      if (res.exists) return ctx.reply("این مورد را قبلاً یاد گرفته بودم، تغییری نکرد.");
      deps.store.save();
      return ctx.reply(`✓ یاد گرفتم: «${text.slice(0, 120)}»`);
    });
  }

  reg("myprofile", { usage: "", desc: "نشان بده چه چیزهایی در موردت یاد گرفته‌ام", group: "personal" });
  bot.command("myprofile", async (ctx) => {
    const user = deps.store.getUser(ctx.from.id);
    const p = teachProfile(user);
    const has = teachCount(user) > 0;
    let msg = has ? `پروفایلی که از «${userName(ctx)}» یاد گرفته‌ام:\n\n` : "هنوز چیزی یاد نگرفته‌ام. با /iam، /imnot، /recommend و /good به من یاد بده.\n";
    for (const [k, v] of Object.entries(p)) {
      if (v.items.length) msg += `▫ ${v.fa}:\n${v.items.map((i) => `  - ${i}`).join("\n")}\n`;
    }
    if (has) msg += `\nبرای پاک کردن: /forgetprofile یا /forgetprofile <فیلد>`;
    return ctx.reply(msg);
  });

  reg("forgetprofile", { usage: "[iam|imnot|recommend|good]", desc: "پاک کردن اطلاعات یادگرفته‌شده", group: "personal" });
  bot.command("forgetprofile", async (ctx) => {
    const arg = String(argText(ctx) || "").trim();
    const key = Object.keys(FIELD_CMDS).find((c) => c === arg.toLowerCase()) ? FIELD_CMDS[arg.toLowerCase()] : null;
    const user = deps.store.getUser(ctx.from.id);
    if (arg && !key) return ctx.reply("فیلد شناخته نشد. فقط: iam, imnot, recommend, good");
    teachClear(user, key);
    deps.store.save();
    return ctx.reply(key ? "آن بخش پاک شد." : "همهٔ یادگرفته‌های پروفایل پاک شد.");
  });

  reg("teachme", { usage: "", desc: "راهنمای آموزش دادن به من", group: "personal" });
  bot.command("teachme", async (ctx) => {
    return ctx.reply(
      "به من یاد بده تو کی هستی تا همیشه طبق آن رفتار کنم:\n\n" +
        "/iam <متن> — من کیستم\n" +
        "/imnot <متن> — چه کسی نیستم\n" +
        "/recommend <متن> — چه چیزی را به من پیشنهاد بده\n" +
        "/good <متن> — چه چیزی برایم خوب است\n\n" +
        "/myprofile — نمایش\n" +
        "/forgetprofile — پاک کردن"
    );
  });
}
