import { reg, argText, replyLong } from "../utils.js";
import config from "../config.js";
import { getDb } from "../db.js";
import {
  remember,
  listMemories,
  forgetMemoryById,
  forgetAll,
  resetConversation,
  dbStats,
} from "../memory.js";
import { registry as toolRegistry } from "../tools.js";

function userIdFrom(ctx) {
  return ctx.from ? ctx.from.id : ctx.chat.id;
}

export default function register(bot) {
  reg("remember", { usage: "<fact>", desc: "Save a long-term memory", group: "ai" });
  reg("memories", { usage: "[count]", desc: "List your saved memories", group: "ai" });
  reg("forget", { usage: "<id>", desc: "Delete a saved memory by id", group: "ai" });
  reg("forgetall", { desc: "Delete all your memories", group: "ai" });
  reg("forgetchat", { desc: "Reset your chat history and summaries", group: "ai" });
  reg("status", { desc: "Bot and system status", group: "core" });

  bot.command("remember", async (ctx) => {
    const text = argText(ctx);
    if (!text) return ctx.reply("Usage: /remember <fact>\nExample: /remember I like espresso");
    try {
      const res = await remember(userIdFrom(ctx), text, "fact", "manual");
      if (!res) return ctx.reply("Nothing to save.");
      return ctx.reply(res.existed ? "That's already in my memory." : "Remembered. I'll keep this in mind.");
    } catch (err) {
      await ctx.reply("Could not save memory: " + (err.message || err));
    }
  });

  bot.command("memories", async (ctx) => {
    const n = Math.min(50, Math.max(1, Number(argText(ctx) || 10) || 10));
    const rows = listMemories(userIdFrom(ctx), n);
    if (!rows.length) return ctx.reply("No memories yet. Use /remember <fact> to save one.");
    const parts = rows
      .map((r) => {
        const date = new Date(r.created_at).toLocaleDateString("fa-IR");
        return `#${r.id} [${r.type}] (${date})\n${r.text}`;
      })
      .join("\n\n");
    await replyLong("Your memories:\n\n" + parts)(ctx);
  });

  bot.command("forget", async (ctx) => {
    const id = Number(argText(ctx));
    if (!id) return ctx.reply("Usage: /forget <id>  (find ids with /memories)");
    const changed = forgetMemoryById(userIdFrom(ctx), id);
    return ctx.reply(changed ? "Memory deleted." : "No memory with that id.");
  });

  bot.command("forgetall", async (ctx) => {
    const n = forgetAll(userIdFrom(ctx));
    return ctx.reply(n ? `Deleted ${n} memories.` : "You had no memories.");
  });

  bot.command("forgetchat", async (ctx) => {
    resetConversation(userIdFrom(ctx));
    return ctx.reply("Chat history and summaries cleared.");
  });

  bot.command("status", async (ctx) => {
    const db = getDb();
    const stats = dbStats();
    const uptime = Math.floor(process.uptime());
    const days = Math.floor(uptime / 86400);
    const hrs = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const info = await ctx.getMe().catch(() => null);
    const lines = [
      `<b>${info ? "@" + info.username : "Bot"} status</b>`,
      `Model: <code>${config.model}</code>`,
      `Owner: ${config.ownerId ? "set" : "not set (system tools disabled)"}`,
      `Agent: ${config.agentEnabled ? "enabled" : "disabled"}`,
      `Uptime: ${days}d ${hrs}h ${mins}m`,
      ``,
      `Memories: ${stats.memories}`,
      `Stored messages: ${stats.conversations}`,
      `Summaries: ${stats.summaries}`,
      `Agent tools: ${toolRegistry.size}`,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });
}
