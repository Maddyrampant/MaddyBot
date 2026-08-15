import { reg, argText, replyLong, isOwnerCtx } from "../utils.js";
import { searchResearch, syncResearch, getResearchStats } from "../research.js";

export default function register(bot) {
  reg("research", { usage: "<topic>", desc: "Search saved research reports", group: "knowledge" });
  reg("research_reindex", { desc: "Re-scan research folder (owner)", group: "knowledge", ownerOnly: true });

  bot.command("research", async (ctx) => {
    const q = argText(ctx);
    if (!q) return ctx.reply("Usage: /research <topic>\nSearches the research reports saved on disk.");
    await ctx.replyWithChatAction("typing");
    const results = await searchResearch(q, 5).catch(() => []);
    if (!results.length) return ctx.reply("No research found for that topic.");
    const parts = results.map(
      (r, i) =>
        `#${i + 1} ${r.title}  (شباهت ${r.score}%)\n` +
        `${r.text.slice(0, 700)}${r.text.length > 700 ? "..." : ""}` +
        (r.sources.length ? `\nمنبع: ${r.sources[0]}` : "")
    );
    await replyLong("نتایج جستجو در گزارش‌های ذخیره‌شده:\n\n" + parts.join("\n\n"));
  });

  bot.command("research_reindex", async (ctx) => {
    if (!isOwnerCtx(ctx)) return ctx.reply("Owner only.");
    await ctx.replyWithChatAction("typing");
    const res = await syncResearch().catch((e) => ({ error: e.message }));
    if (res.error) return ctx.reply("Reindex failed: " + res.error);
    const stats = getResearchStats();
    return ctx.reply(
      `Research folder re-scanned.\n` +
        `New: ${res.indexed}, removed: ${res.removed}, unchanged: ${res.skipped}\n` +
        `Total reports: ${res.total}, chunks: ${stats.chunks}`
    );
  });
}
