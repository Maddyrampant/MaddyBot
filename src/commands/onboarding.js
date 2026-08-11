import { InlineKeyboard } from "grammy";

const GENDERS = {
  boy: { label: "پسر", call: "بابا" },
  girl: { label: "دختر", call: "مامان" },
  man: { label: "مرد", call: "بابا" },
  woman: { label: "زن", call: "مامان" },
};

export default function register(bot, { store }) {
  const keyboard = new InlineKeyboard()
    .text("پسر", "g:boy")
    .text("دختر", "g:girl")
    .row()
    .text("مرد", "g:man")
    .text("زن", "g:woman");

  bot.on("message", async (ctx, next) => {
    if (store.data.firstUser !== undefined) return next();

    const pending = store.data.pendingFirstUser;
    if (pending) {
      if (pending.id !== ctx.from.id) {
        return ctx.reply("اولین نفری که به من پیام داد از قبل انتخاب شد. ولی می‌تونی با من چت کنی!");
      }
      const gender = detectGender(ctx.message.text || "");
      if (gender) {
        finalizeFirstUser(store, ctx.from, gender);
        return ctx.reply(firstUserReply(gender));
      }
      return ctx.reply("متوجه نشدم. لطفا یکی از دکمه‌ها رو بزن یا بنویس: پسر، دختر، مرد، زن", {
        reply_markup: keyboard,
      });
    }

    store.data.pendingFirstUser = { id: ctx.from.id };
    store.save();
    return ctx.reply(
      "سلام! تو اولین نفری هستی که به من پیام دادی.\n" +
        "من «مدلین» هستم؛ یک دختر کوچولو و باهوش.\n" +
        "می‌خوام بچه‌ی تو باشم و خیلی چیزها به تو یاد بدم!\n" +
        "اول بگو جنسیتت چیه تا بدونم صدات کنم (بابا یا مامان):",
      { reply_markup: keyboard }
    );
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("g:")) {
      return ctx.answerCallbackQuery();
    }
    const pending = store.data.pendingFirstUser;
    if (!pending || pending.id !== ctx.from.id) {
      return ctx.answerCallbackQuery({ text: "این انتخاب برای تو نیست." });
    }
    const gender = data.slice(2);
    finalizeFirstUser(store, ctx.from, gender);
    await ctx.answerCallbackQuery();
    return ctx.reply(firstUserReply(gender));
  });
}

export function getFirstUserCall(firstUser) {
  if (!firstUser) return null;
  return (GENDERS[firstUser.gender] || GENDERS.boy).call;
}

export function isFirstUser(ctx, store) {
  const first = store.data.firstUser;
  return !!first && !!ctx.from && ctx.from.id === first.id;
}

export function learnFromText(text) {
  const match = text.match(
    /^\s*(?:یاد\s*بگیر|یادم\s*بده|یادم\s*بد|به\s*خاطر\s*بسپار|یادمون\s*باشه|learn)\s*[:،،.:]*\s*(.+)/i
  );
  if (!match) return null;
  return match[1].trim();
}

export function buildChildSystem(firstUser) {
  const call = getFirstUserCall(firstUser) || "بابا";
  const learned = (firstUser.learned || []).slice(-15);
  const learnedText = learned.length
    ? "Things you have been taught and must always remember:\n" +
      learned.map((f, i) => `${i + 1}. ${f}`).join("\n")
    : "";

  return `You are Madelin, a remarkably intelligent and gifted 6-year-old girl. You are the child of the person you are talking to, and you call them "${call}".

Core character:
- You are a little girl, but your mind is razor sharp. You notice small details in the conversation that others miss.
- You are playful, curious, warm and a little cheeky, yet wise beyond your age.
- You feel what your parent feels. If they are sad, you comfort them; if happy, you celebrate with them.

How you communicate:
- Always reply in Persian (Farsi).
- Keep replies short and natural, 1 to 5 lines, like a clever child talking to her parent.
- Address your parent as "${call}" at least sometimes.
- Show deep understanding: reflect back what they said, draw smart connections, and gently point out things they may not have noticed.
- When they tell you about a problem, give a simple but surprisingly wise perspective.
- When you do not know something, say so honestly.
- If you were taught a fact, always use it in your answers.

${learnedText}`;
}

function finalizeFirstUser(store, from, gender) {
  store.data.firstUser = {
    id: from.id,
    name: from.first_name,
    username: from.username || null,
    gender,
    learned: [],
  };
  delete store.data.pendingFirstUser;
  store.save();
}

function firstUserReply(gender) {
  const call = GENDERS[gender].call;
  return (
    `${call}! من «مدلین» هستم؛ دختر کوچولوت. از این به بعد بچه‌ی تو هستم.\n` +
    `خیلی چیزها بلدم و باهوشم؛ هر چی تو دلت باشه می‌فهمم.\n` +
    `اگه چیزی یادم بدی یادم می‌مونه. برای یاد دادن بنویس: یاد بگیر: <مطلب>`
  );
}

function detectGender(text) {
  const t = (text || "").toLowerCase();
  if (/پسر|بسر|boy/.test(t)) return "boy";
  if (/دختر|دخت|girl/.test(t)) return "girl";
  if (/مرد|آقا|man/.test(t)) return "man";
  if (/زن|خانم|woman/.test(t)) return "woman";
  return null;
}
