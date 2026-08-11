import { reg, argText, uid, clamp, setupHint, todayStr } from "../utils.js";
import { singlePrompt } from "../ai.js";

export default function register(bot, { store }) {
  reg("bmi", { usage: "<height cm> <weight kg>", desc: "BMI calculator", group: "health" });
  reg("calories", { usage: "<age> <male|female> <height cm> <weight kg> [activity 1-5]", desc: "Daily calorie needs", group: "health" });
  reg("sleep", { usage: "<wake time>", desc: "Optimal bedtime by sleep cycles", group: "health" });
  reg("water", { usage: "add <ml> | stats | reset", desc: "Water intake tracker", group: "health" });
  reg("moodlog", { usage: "<1-5> [note] | stats", desc: "Daily mood tracker", group: "health" });
  reg("workout", { usage: "<goal>", desc: "Weekly workout plan", group: "health" });
  reg("meditate", { usage: "[minutes]", desc: "Guided meditation", group: "health" });
  reg("stretch", { desc: "Quick stretch routine", group: "health" });

  bot.command("bmi", (ctx) => {
    const m = argText(ctx).match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
    if (!m) return ctx.reply("Usage: /bmi <height cm> <weight kg>");
    const h = parseFloat(m[1]) / 100;
    const w = parseFloat(m[2]);
    const bmi = w / (h * h);
    const cat = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obese";
    return ctx.reply(
      `BMI: ${bmi.toFixed(1)} (${cat})\nHealthy range for ${h.toFixed(2)} m: ${(18.5 * h * h).toFixed(1)}-${(24.9 * h * h).toFixed(1)} kg`
    );
  });

  bot.command("calories", (ctx) => {
    const m = argText(ctx).match(/^(\d+)\s+(male|female|مرد|زن)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+(\d))?$/i);
    if (!m) return ctx.reply("Usage: /calories <age> <male|female> <height cm> <weight kg> [activity 1-5]");
    const age = parseInt(m[1], 10);
    const female = /female|زن/i.test(m[2]);
    const height = parseFloat(m[3]);
    const weight = parseFloat(m[4]);
    const act = m[5] ? clamp(parseInt(m[5], 10), 1, 5) : 2;
    const bmr = 10 * weight + 6.25 * height - 5 * age + (female ? -161 : 5);
    const factors = [1.2, 1.375, 1.55, 1.725, 1.9];
    const tdee = bmr * factors[act - 1];
    return ctx.reply(
      `BMR: ${Math.round(bmr)} kcal/day\nTDEE (activity ${act}/5): ${Math.round(tdee)} kcal/day\n` +
        `Weight loss (-500): ${Math.round(tdee - 500)} kcal/day\nWeight gain (+500): ${Math.round(tdee + 500)} kcal/day`
    );
  });

  bot.command("sleep", (ctx) => {
    const m = argText(ctx).match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
    if (!m) return ctx.reply("Usage: /sleep <wake time>  e.g. 07:00, 7am, 23:30");
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2] || "0", 10);
    const ampm = (m[3] || "").toLowerCase();
    if (ampm === "pm" && h !== 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    if (!ampm && h < 7) h += 12;
    const wake = h * 60 + min;
    const times = [5, 6, 7].map((cycles) => {
      const t = ((wake - cycles * 90) % 1440 + 1440) % 1440;
      return `Bed at ${fmtClock(t)} (${cycles} cycles = ${cycles * 1.5}h sleep)`;
    });
    return ctx.reply(`To wake at ${fmtClock(wake)}, go to bed at one of:\n` + times.join("\n"));
  });

  bot.command("water", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const today = todayStr();
    if (user.water.date !== today) user.water = { date: today, ml: 0 };
    const parts = argText(ctx).split(/\s+/);
    const sub = (parts[0] || "").toLowerCase();
    if (sub === "add") {
      const ml = parseInt(parts[1], 10);
      if (!ml) return ctx.reply("Usage: /water add <ml>");
      user.water.ml += ml;
    } else if (sub === "reset") {
      user.water.ml = 0;
    }
    store.save();
    const goal = 2500;
    const pct = Math.min(100, Math.round((user.water.ml / goal) * 100));
    const bar = "#".repeat(Math.floor(pct / 10)) + "-".repeat(10 - Math.floor(pct / 10));
    return ctx.reply(`Water today: ${user.water.ml} ml of ${goal} ml\n${bar} ${pct}%${pct >= 100 ? " - goal reached!" : ""}`);
  });

  bot.command("moodlog", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const parts = argText(ctx).split(/\s+/);
    const sub = (parts[0] || "").toLowerCase();
    if (sub === "stats") {
      if (!user.moodLog.length) return ctx.reply("No mood entries yet. /moodlog <1-5> [note]");
      const avg = user.moodLog.reduce((s, e) => s + e.mood, 0) / user.moodLog.length;
      const last = user.moodLog.slice(-7).map((e) => `${e.mood}${e.note ? "(" + e.note.slice(0, 12) + ")" : ""}`).join(" -> ");
      return ctx.reply(`Average mood: ${avg.toFixed(2)}/5\nLast 7 entries: ${last}`);
    }
    const mood = parseInt(sub, 10);
    if (isNaN(mood) || mood < 1 || mood > 5) return ctx.reply("Usage: /moodlog <1-5> [note] - 1 very bad, 5 great");
    const date = todayStr();
    const idx = user.moodLog.findIndex((e) => e.date === date);
    const entry = { date, mood, note: parts.slice(1).join(" ") };
    if (idx >= 0) user.moodLog[idx] = entry;
    else user.moodLog.push(entry);
    store.save();
    return ctx.reply(`Mood logged: ${mood}/5`);
  });

  bot.command("workout", async (ctx) => {
    const goal = argText(ctx);
    if (!goal) return ctx.reply("Usage: /workout <goal> e.g. lose weight, build muscle, home workout");
    await ctx.replyWithChatAction("typing");
    try {
      const out = await singlePrompt(
        "Create a precise weekly workout plan for: " + goal + ". Include sets, reps, rest days, and a safety note. Answer in Persian."
      );
      return ctx.reply(out);
    } catch (err) {
      return ctx.reply(err.message === "NO_GEMINI_KEY" ? setupHint() : "Could not generate the workout plan.");
    }
  });

  bot.command("meditate", (ctx) => {
    const minutes = clamp(parseInt(argText(ctx), 10) || 5, 1, 30);
    return ctx.reply(
      `${minutes}-minute guided meditation:\n` +
        `1. Sit comfortably, back straight, eyes closed.\n` +
        `2. Breathe in 4 counts, hold 4, breathe out 6. Repeat.\n` +
        `3. Scan your body head to toes and relax each part.\n` +
        `4. Notice thoughts without judging; return to the breath.\n` +
        `5. When ready, wiggle fingers and toes, open your eyes.\n` +
        `Consistency beats intensity.`
    );
  });

  bot.command("stretch", (ctx) => {
    return ctx.reply(
      `Quick stretch routine (5 min):\n` +
        `1. Neck rolls - 30s each side\n` +
        `2. Shoulder shrugs - 15 reps\n` +
        `3. Hamstring stretch - 30s each leg\n` +
        `4. Quad stretch - 30s each leg\n` +
        `5. Calf stretch - 30s each leg\n` +
        `6. Deep breaths - 1 min`
    );
  });
}

function fmtClock(min) {
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}
