import { reg, argText, uid, clamp, setupHint, todayStr } from "../utils.js";
import { MINUTE } from "../scheduler.js";
import { singlePrompt } from "../ai.js";

const PRIORITIES = { high: "RED", med: "YELLOW", low: "GREEN" };
const pomodoros = new Map();

export default function register(bot, { store }) {
  reg("deadline", { usage: "<n> <YYYY-MM-DD>", desc: "Set a deadline on a task", group: "productivity" });
  reg("pomodoro", { usage: "start [min] | stop | status", desc: "Focus timer", group: "productivity" });
  reg("worklog", { usage: "<text> | list | del <n>", desc: "Log what you worked on", group: "productivity" });
  reg("standup", { desc: "Daily standup from your worklog", group: "productivity" });
  reg("meeting", { usage: "<title> | note <n> <text> | list | del <n>", desc: "Track meeting notes", group: "productivity" });
  reg("habit", { usage: "<name> | done <n> | list | del <n>", desc: "Habit tracker with streaks", group: "productivity" });
  reg("priority", { usage: "<task n> <high|med|low>", desc: "Set task priority", group: "productivity" });

  bot.command("deadline", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const m = argText(ctx).match(/^(\d+)\s+(\d{4}-\d{2}-\d{2})$/);
    if (!m) return ctx.reply("Usage: /deadline <task n> <YYYY-MM-DD>");
    const task = user.todos[parseInt(m[1], 10) - 1];
    if (!task) return ctx.reply("Task not found. Use /todo to see your tasks.");
    task.deadline = m[2];
    store.save();
    return ctx.reply(`Deadline set: "${task.text}" to ${m[2]}`);
  });

  bot.command("pomodoro", (ctx) => {
    const id = ctx.from.id;
    const parts = argText(ctx).split(/\s+/);
    const sub = (parts[0] || "").toLowerCase();
    if (sub === "start") {
      const mins = clamp(parseInt(parts[1], 10) || 25, 5, 120);
      pomodoros.set(id, Date.now() + mins * MINUTE);
      const user = store.getUser(id);
      user.reminders.push({
        id: uid(),
        at: Date.now() + mins * MINUTE,
        text: "Pomodoro finished! Time for a short break.",
        chatId: ctx.chat.id,
      });
      store.save();
      return ctx.reply(`Pomodoro started for ${mins} minutes. Focus!`);
    }
    if (sub === "stop") {
      pomodoros.delete(id);
      return ctx.reply("Pomodoro stopped.");
    }
    if (sub === "status") {
      const end = pomodoros.get(id);
      if (!end) return ctx.reply("No active pomodoro. Start one with /pomodoro start [minutes]");
      const left = Math.max(0, Math.ceil((end - Date.now()) / MINUTE));
      return ctx.reply(`Pomodoro active: ${left} minute(s) left.`);
    }
    return ctx.reply("Usage: /pomodoro start [minutes] | stop | status");
  });

  bot.command("worklog", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const args = argText(ctx);
    const parts = args.split(/\s+/);
    const sub = (parts[0] || "").toLowerCase();
    if (sub === "list") {
      const entries = user.worklog.filter((w) => new Date(w.ts).toDateString() === new Date().toDateString());
      if (!entries.length) return ctx.reply("Nothing logged today yet.");
      return ctx.reply(
        "Today's worklog:\n" +
          entries
            .map(
              (w, i) =>
                `${i + 1}. ${w.text} (${new Date(w.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })})`
            )
            .join("\n")
      );
    }
    if (sub === "del") {
      const n = parseInt(parts[1], 10);
      if (!n || n < 1 || n > user.worklog.length) return ctx.reply("Invalid index.");
      user.worklog.splice(n - 1, 1);
      store.save();
      return ctx.reply("Entry deleted.");
    }
    if (!args) return ctx.reply("Usage: /worklog <what you did> | list | del <n>");
    user.worklog.push({ id: uid(), text: args, ts: Date.now() });
    store.save();
    return ctx.reply("Logged. Total entries: " + user.worklog.length);
  });

  bot.command("standup", async (ctx) => {
    const user = store.getUser(ctx.from.id);
    const entries = user.worklog.filter((w) => new Date(w.ts).toDateString() === new Date().toDateString());
    if (!entries.length) return ctx.reply("Nothing in today's worklog yet. Add entries with /worklog <text>");
    const list = entries.map((e) => "- " + e.text).join("\n");
    await ctx.replyWithChatAction("typing");
    try {
      const out = await singlePrompt(
        "Turn this raw worklog into a clear daily standup (Done / Next / Blockers). Keep it short. Answer in Persian.\n\n" + list
      );
      return ctx.reply(out);
    } catch (err) {
      return ctx.reply(err.message === "NO_GEMINI_KEY" ? setupHint() : "Could not generate the standup.");
    }
  });

  bot.command("meeting", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const args = argText(ctx);
    const parts = args.split(/\s+/);
    const sub = (parts[0] || "").toLowerCase();
    if (sub === "note") {
      const n = parseInt(parts[1], 10);
      const note = parts.slice(2).join(" ");
      const m = user.meetings[n - 1];
      if (!m || !note) return ctx.reply("Usage: /meeting note <n> <text>");
      m.notes = m.notes ? m.notes + "\n" + note : note;
      store.save();
      return ctx.reply(`Note added to meeting ${n} (${m.title}).`);
    }
    if (sub === "list") {
      if (!user.meetings.length) return ctx.reply("No meetings yet.");
      return ctx.reply(
        user.meetings
          .map((m, i) => `${i + 1}. ${m.title} (${m.date})${m.notes ? " - " + m.notes.split("\n").length + " note(s)" : ""}`)
          .join("\n")
      );
    }
    if (sub === "del") {
      const n = parseInt(parts[1], 10);
      if (!n || !user.meetings[n - 1]) return ctx.reply("Invalid index.");
      user.meetings.splice(n - 1, 1);
      store.save();
      return ctx.reply("Meeting deleted.");
    }
    if (!args) return ctx.reply("Usage: /meeting <title> | note <n> <text> | list | del <n>");
    user.meetings.push({ id: uid(), title: args, notes: "", date: todayStr() });
    store.save();
    return ctx.reply(`Meeting created: ${args} (${todayStr()})`);
  });

  bot.command("habit", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const args = argText(ctx);
    const parts = args.split(/\s+/);
    const sub = (parts[0] || "").toLowerCase();
    const today = todayStr();
    if (sub === "done") {
      const h = user.habits[parseInt(parts[1], 10) - 1];
      if (!h) return ctx.reply("Invalid index. Use /habit list");
      if (!h.dates.includes(today)) h.dates.push(today);
      store.save();
      return ctx.reply(`Checked off: ${h.name} (${h.dates.length} total days).`);
    }
    if (sub === "list") {
      if (!user.habits.length) return ctx.reply("No habits yet. Create one with /habit <name>");
      return ctx.reply(
        user.habits
          .map((h, i) => `${i + 1}. ${h.name} - streak ${streak(h.dates)} day(s), done ${h.dates.length} days`)
          .join("\n")
      );
    }
    if (sub === "del") {
      const n = parseInt(parts[1], 10);
      if (!n || !user.habits[n - 1]) return ctx.reply("Invalid index.");
      user.habits.splice(n - 1, 1);
      store.save();
      return ctx.reply("Habit deleted.");
    }
    if (!args) return ctx.reply("Usage: /habit <name> | done <n> | list | del <n>");
    if (user.habits.some((h) => h.name.toLowerCase() === args.toLowerCase())) return ctx.reply("That habit already exists.");
    user.habits.push({ id: uid(), name: args, dates: [] });
    store.save();
    return ctx.reply(`Habit created: ${args}`);
  });

  bot.command("priority", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const m = argText(ctx).match(/^(\d+)\s+(high|med|low|بالا|متوسط|کم)$/i);
    if (!m) return ctx.reply("Usage: /priority <task n> <high|med|low>");
    const task = user.todos[parseInt(m[1], 10) - 1];
    if (!task) return ctx.reply("Task not found.");
    const raw = m[2].toLowerCase();
    task.priority = raw === "بالا" || raw === "high" ? "high" : raw === "کم" || raw === "low" ? "low" : "med";
    store.save();
    return ctx.reply(`Priority set: ${PRIORITIES[task.priority]} ${task.text}`);
  });
}

function streak(dates) {
  const set = new Set(dates);
  let count = 0;
  const d = new Date();
  if (!set.has(todayStr())) d.setDate(d.getDate() - 1);
  while (set.has(fmtDate(d))) {
    count += 1;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function fmtDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
