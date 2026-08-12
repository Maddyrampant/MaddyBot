import { todayStr } from "./utils.js";

const MINUTE = 60 * 1000;

const TIPS = [
  "🌱 هر روز کوچک‌ترین قدم ممکن را بردار؛ تکرار، بر قدرت غلبه می‌کند.",
  "💧 نصف وزن بدنت را به میلی‌لیتر آب بنوش: وزن(kg) × 30 = آب روزانه.",
  "🧠 ۵ دقیقه نفس عمیق صبح‌ها، تمرکز کل روزت را تغییر می‌دهد.",
  "📖 روزی ۱۰ صفحه، یعنی سالی بیش از ۳۰ کتاب.",
  "🎯 به جای سه هدف بزرگ، یک هدف کوچک را کامل کن.",
  "🛌 هفت تا نه ساعت خواب، بهترین سرمایه‌گذاری برای فردا است.",
  "✨ چیزی که امروز به تعویق می‌اندازی، همان چیزی است که فردا باز می‌آید.",
  "🚶 ۲۰ دقیقه پیاده‌روی سریع، خلق‌وخوی روز را بهتر می‌کند.",
];

export function buildDigest(user) {  const today = todayStr();
  const lines = [];
  lines.push("☀️ گزارش روزانه");
  lines.push("");
  lines.push("📅 " + new Date().toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));

  const reminders = (user.reminders || []).filter((r) => new Date(r.at).toLocaleDateString("en-CA") === today);
  if (reminders.length) {
    lines.push("");
    lines.push("⏰ یادآورهای امروز:");
    for (const r of reminders) {
      const t = new Date(r.at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
      lines.push(`• ${t} — ${r.text}`);
    }
  }

  const habits = (user.habits || []).filter((h) => (h.dates || []).includes(today));
  if (habits.length) {
    lines.push("");
    lines.push(`🎯 عادت‌هایی که امروز انجام دادی: ${habits.map((h) => h.name).join("، ")}`);
  }

  const water = user.water || {};
  if (water.date === today && water.ml > 0) {
    lines.push("");
    lines.push(`💧 آب امروز: ${water.ml} میلی‌لیتر`);
  }

  const mood = (user.moodLog || []).find((e) => e.date === today);
  if (mood) {
    const faces = ["😞", "😕", "😐", "🙂", "🤩"];
    lines.push("");
    lines.push(`😊 حال‌وهوای امروز: ${faces[mood.mood - 1] || mood.mood}/5`);
  }

  const todos = (user.todos || []).filter((t) => t.deadline && new Date(t.deadline).toLocaleDateString("en-CA") === today && !t.done);
  if (todos.length) {
    lines.push("");
    lines.push("📌 کارهای با مهلت امروز:");
    for (const t of todos) lines.push(`• ${t.text}`);
  }

  lines.push("");
  lines.push(TIPS[Math.floor(Math.random() * TIPS.length)]);
  return lines.join("\n");
}

export function startScheduler(bot, store) {
  setInterval(async () => {
    const now = Date.now();
    for (const id of Object.keys(store.data.users || {})) {
      const user = store.data.users[id];
      const due = (user.reminders || []).filter((r) => r.at <= now);
      if (!due.length) continue;
      user.reminders = (user.reminders || []).filter((r) => r.at > now);
      store.save();
      for (const r of due) {
        try {
          await bot.api.sendMessage(r.chatId, `Reminder: ${r.text}`);
        } catch {
          // ignore delivery errors
        }
      }
    }
  }, 15 * 1000);

  setInterval(async () => {
    const now = new Date();
    const time =
      String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    const today = todayStr();
    for (const id of Object.keys(store.data.users || {})) {
      const user = store.data.users[id];
      const dg = user.digest;
      if (!dg || !dg.enabled || dg.time !== time || dg.lastSent === today) continue;
      dg.lastSent = today;
      store.save();
      try {
        await bot.api.sendMessage(user.lastChatId || Number(id), buildDigest(user));
      } catch {
        // ignore delivery errors
      }
    }
  }, 60 * 1000);
}

export { MINUTE };
