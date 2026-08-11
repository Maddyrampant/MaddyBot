import { reg, argText, uid } from "../utils.js";
import { MINUTE } from "../scheduler.js";

export default function register(bot, { store }) {
  reg("todo", { usage: "add <text> | done <n> | del <n> | clear", desc: "Manage your task list", group: "personal" });
  reg("notes", { usage: "add <text> | del <n> | clear", desc: "Manage your notes", group: "personal" });
  reg("remind", { usage: "<minutes> <text>", desc: "Set a reminder", group: "personal" });
  reg("reminders", { desc: "List active reminders", group: "personal" });
  reg("alias", { usage: "<keyword> = <reply> | del <keyword>", desc: "Custom keyword replies", group: "personal" });
  reg("birthday", { usage: "[YYYY-MM-DD]", desc: "Save or show your birthday", group: "personal" });
  reg("profile", { desc: "Your bot profile", group: "personal" });

  bot.command("todo", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const args = argText(ctx);
    const parts = args.split(/\s+/);
    const sub = parts[0] || "";

    if (sub === "add") {
      const text = parts.slice(1).join(" ");
      if (!text) return ctx.reply("Usage: /todo add <task text>");
      user.todos.push({ id: uid(), text, done: false, createdAt: Date.now() });
      store.save();
      return ctx.reply(`Task added. You have ${user.todos.filter((t) => !t.done).length} open.`);
    }
    if (sub === "done" || sub === "del") {
      const n = parseInt(parts[1], 10);
      if (!n || n < 1 || n > user.todos.length) return ctx.reply(`Provide a number between 1 and ${user.todos.length}.`);
      if (sub === "done") {
        user.todos[n - 1].done = true;
        store.save();
        return ctx.reply(`Task ${n} marked as done.`);
      }
      user.todos.splice(n - 1, 1);
      store.save();
      return ctx.reply(`Task ${n} deleted.`);
    }
    if (sub === "clear") {
      user.todos = [];
      store.save();
      return ctx.reply("All tasks cleared.");
    }
    if (!user.todos.length) return ctx.reply("Your task list is empty. Add one with /todo add <task>");
    const lines = user.todos.map(
      (t, i) => `${i + 1}. ${t.done ? "\u2705 " : "\u26AA "}${t.text}`
    );
    return ctx.reply("Your tasks:\n" + lines.join("\n"));
  });

  bot.command("notes", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const args = argText(ctx);
    const parts = args.split(/\s+/);
    const sub = parts[0] || "";

    if (sub === "add") {
      const text = parts.slice(1).join(" ");
      if (!text) return ctx.reply("Usage: /notes add <note text>");
      user.notes.push({ id: uid(), text, createdAt: Date.now() });
      store.save();
      return ctx.reply(`Note saved. You have ${user.notes.length} notes.`);
    }
    if (sub === "del") {
      const n = parseInt(parts[1], 10);
      if (!n || n < 1 || n > user.notes.length) return ctx.reply(`Provide a number between 1 and ${user.notes.length}.`);
      user.notes.splice(n - 1, 1);
      store.save();
      return ctx.reply(`Note ${n} deleted.`);
    }
    if (sub === "clear") {
      user.notes = [];
      store.save();
      return ctx.reply("All notes cleared.");
    }
    if (!user.notes.length) return ctx.reply("You have no notes. Add one with /notes add <text>");
    return ctx.reply("Your notes:\n" + user.notes.map((n, i) => `${i + 1}. ${n.text}`).join("\n"));
  });

  bot.command("remind", (ctx) => {
    const args = argText(ctx);
    const m = args.match(/^(\d+)\s+(.+)$/);
    if (!m) return ctx.reply("Usage: /remind <minutes> <text>");
    const minutes = parseInt(m[1], 10);
    const text = m[2];
    if (minutes < 1 || minutes > 24 * 60) return ctx.reply("Minutes must be between 1 and 1440.");
    const user = store.getUser(ctx.from.id);
    user.reminders.push({ id: uid(), at: Date.now() + minutes * MINUTE, text, chatId: ctx.chat.id });
    store.save();
    return ctx.reply(`Reminder set for ${minutes} minute(s): ${text}`);
  });

  bot.command("reminders", (ctx) => {
    const user = store.getUser(ctx.from.id);
    if (!user.reminders.length) return ctx.reply("No active reminders.");
    const lines = user.reminders.map((r, i) => {
      const mins = Math.max(1, Math.round((r.at - Date.now()) / MINUTE));
      return `${i + 1}. In ~${mins} min: ${r.text}`;
    });
    return ctx.reply("Active reminders:\n" + lines.join("\n"));
  });

  bot.command("alias", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const args = argText(ctx);
    if (!args) {
      const keys = Object.keys(user.aliases);
      if (!keys.length) return ctx.reply("No custom aliases. Set one with /alias <keyword> = <reply>");
      return ctx.reply("Your aliases:\n" + keys.join("\n"));
    }
    if (/^del\s+/i.test(args)) {
      const key = args.replace(/^del\s+/i, "").trim().toLowerCase();
      if (user.aliases[key]) {
        delete user.aliases[key];
        store.save();
        return ctx.reply(`Alias "${key}" deleted.`);
      }
      return ctx.reply(`No alias named "${key}".`);
    }
    const eq = args.indexOf("=");
    if (eq === -1) return ctx.reply("Usage: /alias <keyword> = <reply>");
    const key = args.slice(0, eq).trim().toLowerCase();
    const reply = args.slice(eq + 1).trim();
    if (!key || !reply) return ctx.reply("Usage: /alias <keyword> = <reply>");
    user.aliases[key] = reply;
    store.save();
    return ctx.reply(`Alias set: "${key}" -> "${reply}"`);
  });

  bot.command("birthday", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const value = argText(ctx);
    if (!value) {
      return ctx.reply(user.birthday ? `Your birthday: ${user.birthday}` : "No birthday saved. Set it with /birthday YYYY-MM-DD");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ctx.reply("Use format: /birthday YYYY-MM-DD");
    user.birthday = value;
    store.save();
    return ctx.reply(`Birthday saved: ${value}`);
  });

  bot.command("profile", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const from = ctx.from;
    const s = user.settings;
    return ctx.reply(
      `Profile for @${from.username || from.first_name}\n` +
        `Messages: ${user.messageCount}\n` +
        `Tasks open: ${user.todos.filter((t) => !t.done).length}\n` +
        `Notes: ${user.notes.length}\n` +
        `Aliases: ${Object.keys(user.aliases).length}\n` +
        `Reminders: ${user.reminders.length}\n` +
        `Tone: ${s.tone}`
    );
  });
}
