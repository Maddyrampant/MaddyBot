import { reg, registry, argText, replyLong, allGroups, commandsByGroup, groupLabel } from "../utils.js";

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
      "Hello! I am MaddyBot.\n" +
        "I can chat, translate, generate QR codes, play games, check the weather and much more.\n" +
        "Type /commands to see everything I can do."
    );
  });

  bot.command(["help", "commands"], async (ctx) => {
    const arg = argText(ctx);
    if (arg) {
      const meta = registry[arg.replace(/^\//, "")];
      if (meta) {
        return ctx.reply(
          `/${meta.name}${meta.usage ? " " + meta.usage : ""}\n${meta.desc}\nGroup: ${groupLabel(meta.group)}`
        );
      }
      return ctx.reply("Unknown command: /" + arg);
    }

    const targetGroup = arg.trim();
    let out = "<b>MaddyBot commands</b>\n\n";
    for (const [key] of allGroups()) {
      const cmds = commandsByGroup(key);
      if (!cmds.length) continue;
      if (targetGroup && key !== targetGroup) continue;
      out += `<b>${groupLabel(key)}</b>\n`;
      out += cmds.map((c) => `/${c.name}${c.usage ? " <i>" + c.usage + "</i>" : ""}`).join(" · ");
      out += "\n\n";
    }
    out += "Tip: /help <command> shows details for one command.";
    await replyLong(out, { parse_mode: "HTML" })(ctx);
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
      `First name: ${from.first_name || "-"}`,
      `Username: ${from.username ? "@" + from.username : "-"}`,
      `User ID: <code>${from.id}</code>`,
      `Messages sent to me: ${user.messageCount}`,
    ];
    if (user.birthday) lines.push(`Birthday: ${user.birthday}`);
    if (user.todos.length) lines.push(`Open tasks: ${user.todos.filter((t) => !t.done).length}`);
    if (user.reminders.length) lines.push(`Active reminders: ${user.reminders.length}`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(
      "MaddyBot is a multi-purpose Telegram assistant with 100+ commands:\n" +
        "chat, translation, text tools, math, weather, QR codes, games, reminders and more."
    );
  });

  bot.command("stats", async (ctx) => {
    const user = store.getUser(ctx.from.id);
    const chat = store.getChat(ctx.chat.id);
    const uptime = Math.floor((Date.now() - bootTime) / 1000);
    await ctx.reply(
      `Users known: <code>${Object.keys(store.data.users).length}</code>\n` +
        `Messages in this chat: <code>${chat.messageCount}</code>\n` +
        `Your messages: <code>${user.messageCount}</code>\n` +
        `Uptime: <code>${uptime}s</code>`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("version", async (ctx) => {
    await ctx.reply("MaddyBot v1.0.0");
  });

  bot.command("ping", async (ctx) => {
    const start = Date.now();
    await ctx.reply("Pong!");
    await ctx.reply(`Round trip: ${Date.now() - start}ms`);
  });

  bot.command("settings", async (ctx) => {
    const s = store.getUser(ctx.from.id).settings;
    await ctx.reply(`Your settings:\nTone: <code>${s.tone}</code>\nReply mode: <code>${s.replyMode}</code>`, {
      parse_mode: "HTML",
    });
  });

  bot.command("feedback", async (ctx) => {
    const text = argText(ctx);
    if (!text) return ctx.reply("Usage: /feedback <your feedback>");
    store.addFeedback(`from ${ctx.from.id}: ${text}`);
    await ctx.reply("Thanks! Your feedback was saved.");
  });

  bot.command("report", async (ctx) => {
    const text = argText(ctx);
    if (!text) return ctx.reply("Usage: /report <problem description>");
    store.addFeedback(`REPORT from ${ctx.from.id}: ${text}`);
    await ctx.reply("Issue reported. Thank you.");
  });
}
