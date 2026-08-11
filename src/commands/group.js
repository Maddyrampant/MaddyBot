import { reg, argText, isAdmin } from "../utils.js";
import config from "../config.js";

export default function register(bot, { store }) {
  if (!store.data.welcome) store.data.welcome = {};
  if (!store.data.warns) store.data.warns = {};
  if (!store.data.rules) store.data.rules = {};

  reg("welcome", { usage: "set <text>", desc: "Show or set the group welcome message", group: "group" });
  reg("kick", { desc: "Kick a user (reply to them)", group: "group" });
  reg("ban", { desc: "Ban a user (reply to them)", group: "group" });
  reg("unban", { desc: "Unban a user", group: "group" });
  reg("mute", { usage: "[minutes]", desc: "Mute a user (reply to them)", group: "group" });
  reg("unmute", { desc: "Unmute a user (reply to them)", group: "group" });
  reg("warn", { desc: "Warn a user, 3 warns = kick", group: "group" });
  reg("admins", { desc: "List group administrators", group: "group" });
  reg("pin", { desc: "Pin a message (reply to it)", group: "group" });
  reg("unpin", { desc: "Unpin the last pinned message", group: "group" });
  reg("rules", { usage: "set <text> | show", desc: "Group rules", group: "group" });
  reg("slow", { usage: "<seconds> | off", desc: "Slow mode for the group", group: "group" });

  bot.command("welcome", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const args = argText(ctx);
    if (/^set\s+/i.test(args)) {
      if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can change this.");
      const text = args.replace(/^set\s+/i, "").trim();
      if (!text) return ctx.reply("Usage: /welcome set <message>");
      store.data.welcome[chatId] = text;
      store.save();
      return ctx.reply("Welcome message saved.");
    }
    return ctx.reply(
      store.data.welcome[chatId]
        ? "Current welcome message:\n" + store.data.welcome[chatId]
        : "No welcome message set. Set one with /welcome set <message>"
    );
  });

  bot.on("message:new_chat_members", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const msg = store.data.welcome[chatId];
    if (!msg) return;
    const names = ctx.message.new_chat_members.map((u) => (u.username ? "@" + u.username : u.first_name)).join(", ");
    await ctx.reply(names + " — " + msg);
  });

  bot.command("kick", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    const target = getTarget(ctx);
    if (!target) return ctx.reply("Reply to a user's message to kick them.");
    try {
      await ctx.api.kickChatMember(ctx.chat.id, target.id);
      await ctx.api.unbanChatMember(ctx.chat.id, target.id);
      return ctx.reply(`${name(target)} kicked.`);
    } catch {
      return ctx.reply("I need admin rights to kick users.");
    }
  });

  bot.command("ban", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    const target = getTarget(ctx);
    if (!target) return ctx.reply("Reply to a user's message to ban them.");
    try {
      await ctx.api.banChatMember(ctx.chat.id, target.id);
      return ctx.reply(`${name(target)} banned.`);
    } catch {
      return ctx.reply("I need admin rights to ban users.");
    }
  });

  bot.command("unban", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    const target = getTarget(ctx);
    if (!target) return ctx.reply("Reply to a user's message to unban them.");
    try {
      await ctx.api.unbanChatMember(ctx.chat.id, target.id);
      return ctx.reply(`${name(target)} unbanned.`);
    } catch {
      return ctx.reply("I need admin rights to unban users.");
    }
  });

  bot.command("mute", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    const target = getTarget(ctx);
    if (!target) return ctx.reply("Reply to a user's message to mute them.");
    const minutes = parseInt(argText(ctx), 10);
    const until = minutes ? Date.now() / 1000 + minutes * 60 : Date.now() / 1000 + 365 * 24 * 3600;
    try {
      await ctx.api.restrictChatMember(ctx.chat.id, target.id, {
        permissions: { can_send_messages: false, can_send_media_messages: false, can_send_other_messages: false, can_add_web_page_previews: false },
        until_date: until,
      });
      return ctx.reply(`${name(target)} muted${minutes ? ` for ${minutes} minutes` : ""}.`);
    } catch {
      return ctx.reply("I need admin rights to mute users.");
    }
  });

  bot.command("unmute", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    const target = getTarget(ctx);
    if (!target) return ctx.reply("Reply to a user's message to unmute them.");
    try {
      await ctx.api.restrictChatMember(ctx.chat.id, target.id, {
        permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true },
      });
      return ctx.reply(`${name(target)} unmuted.`);
    } catch {
      return ctx.reply("I need admin rights to unmute users.");
    }
  });

  bot.command("warn", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    const target = getTarget(ctx);
    if (!target) return ctx.reply("Reply to a user's message to warn them.");
    const chatId = String(ctx.chat.id);
    if (!store.data.warns[chatId]) store.data.warns[chatId] = {};
    const count = (store.data.warns[chatId][target.id] || 0) + 1;
    store.data.warns[chatId][target.id] = count;
    store.save();
    if (count >= 3) {
      try {
        await ctx.api.kickChatMember(ctx.chat.id, target.id);
        await ctx.api.unbanChatMember(ctx.chat.id, target.id);
        delete store.data.warns[chatId][target.id];
        store.save();
        return ctx.reply(`${name(target)} received 3 warnings and was kicked.`);
      } catch {
        return ctx.reply(`${name(target)} now has ${count} warnings.`);
      }
    }
    return ctx.reply(`${name(target)} warned (${count}/3).`);
  });

  bot.command("admins", async (ctx) => {
    try {
      const admins = await ctx.getChatAdministrators();
      const lines = admins
        .filter((m) => m.user)
        .map((m) => `${m.user.username ? "@" + m.user.username : m.user.first_name}${m.status === "creator" ? " (owner)" : ""}`);
      return ctx.reply("Admins:\n" + lines.join("\n"));
    } catch {
      return ctx.reply("Could not fetch the admin list.");
    }
  });

  bot.command("pin", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    const reply = ctx.message.reply_to_message;
    if (!reply) return ctx.reply("Reply to a message to pin it.");
    try {
      await ctx.api.pinChatMessage(ctx.chat.id, reply.message_id);
      return ctx.reply("Message pinned.");
    } catch {
      return ctx.reply("I need admin rights to pin messages.");
    }
  });

  bot.command("unpin", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    try {
      await ctx.api.unpinChatMessage(ctx.chat.id);
      return ctx.reply("Latest pinned message removed.");
    } catch {
      return ctx.reply("I need admin rights to unpin messages.");
    }
  });

  bot.command("rules", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const args = argText(ctx);
    if (/^set\s+/i.test(args)) {
      if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
      const text = args.replace(/^set\s+/i, "").trim();
      if (!text) return ctx.reply("Usage: /rules set <rules text>");
      store.data.rules[chatId] = text;
      store.save();
      return ctx.reply("Rules saved.");
    }
    return ctx.reply(store.data.rules[chatId] ? "Group rules:\n" + store.data.rules[chatId] : "No rules set yet. Admins can set them with /rules set <text>");
  });

  bot.command("slow", async (ctx) => {
    if (!(await isAdminUser(ctx))) return ctx.reply("Only administrators can do this.");
    const args = argText(ctx).trim().toLowerCase();
    if (args === "off") {
      try {
        await ctx.api.setChatSlowMode(ctx.chat.id, 0);
        return ctx.reply("Slow mode disabled.");
      } catch {
        return ctx.reply("I need admin rights to change slow mode.");
      }
    }
    const secs = parseInt(args, 10);
    if (isNaN(secs) || secs < 1 || secs > 3600) return ctx.reply("Usage: /slow <seconds> (max 3600) | off");
    try {
      await ctx.api.setChatSlowMode(ctx.chat.id, secs);
      return ctx.reply(`Slow mode set to ${secs} seconds.`);
    } catch {
      return ctx.reply("I need admin rights to change slow mode.");
    }
  });
}

async function isAdminUser(ctx) {
  if (config.ownerId && ctx.from.id === config.ownerId) return true;
  try {
    const member = await ctx.getChatMember(ctx.from.id);
    return isAdmin(member);
  } catch {
    return false;
  }
}

function getTarget(ctx) {
  const reply = ctx.message.reply_to_message;
  if (reply && reply.from) return reply.from;
  const arg = argText(ctx).trim().replace(/^@/, "");
  if (!arg) return null;
  if (/^\d+$/.test(arg)) return { id: Number(arg), first_name: arg };
  return null;
}

function name(u) {
  return u.username ? "@" + u.username : u.first_name || u.id;
}
