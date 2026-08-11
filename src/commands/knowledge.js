import { reg, argText, setupHint } from "../utils.js";
import { getJSON } from "../http.js";
import { singlePrompt } from "../ai.js";

export default function register(bot) {
  reg("wiki", { usage: "<topic>", desc: "Wikipedia summary", group: "knowledge" });
  reg("define", { usage: "<word>", desc: "Dictionary definition", group: "knowledge" });
  reg("learn", { usage: "<skill>", desc: "Learning path for a skill", group: "knowledge" });
  reg("teach", { usage: "<topic>", desc: "Madelin teaches you a topic", group: "knowledge" });
  reg("interview", { usage: "<role>", desc: "Interview questions for a role", group: "knowledge" });
  reg("resume", { usage: "<role>", desc: "Resume tips for a role", group: "knowledge" });
  reg("coverletter", { usage: "<role> <company>", desc: "Draft a cover letter", group: "knowledge" });
  reg("book", { usage: "<topic>", desc: "Book recommendations", group: "knowledge" });

  bot.command("wiki", async (ctx) => {
    const topic = argText(ctx);
    if (!topic) return ctx.reply("Usage: /wiki <topic>");
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.replace(/\s+/g, "_"))}`
      );
      if (!data.extract) return ctx.reply("Not found on Wikipedia.");
      return ctx.reply(
        `${data.title}\n\n${data.extract.slice(0, 1200)}${data.extract.length > 1200 ? "..." : ""}` +
          `\n\n${data.content_urls?.desktop?.page || ""}`
      );
    } catch {
      return ctx.reply("Could not fetch Wikipedia.");
    }
  });

  bot.command("define", async (ctx) => {
    const word = argText(ctx);
    if (!word) return ctx.reply("Usage: /define <word>");
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const entry = data[0];
      if (!entry) return ctx.reply("Word not found.");
      const lines = [`${entry.word}${entry.phonetic ? " " + entry.phonetic : ""}`];
      for (const m of entry.meanings.slice(0, 3)) {
        lines.push(`*${m.partOfSpeech}*`);
        for (const d of m.definitions.slice(0, 2)) {
          lines.push(`- ${d.definition}${d.example ? `\n  e.g. "${d.example}"` : ""}`);
        }
      }
      return ctx.reply(lines.join("\n"));
    } catch {
      return ctx.reply("Word not found in the dictionary.");
    }
  });

  const geminiCmds = {
    learn: (t) => `Create a precise step-by-step learning path to get good at: ${t}. Include topic order, practice ideas, and time estimates. Answer in Persian.`,
    teach: (t) => `You are a great tutor. Teach me "${t}" clearly and simply with examples, as if I am a beginner. Answer in Persian.`,
    interview: (t) => `Give 10 realistic interview questions for the role: ${t}, grouped by skill area, plus 3 answering tips. Answer in Persian.`,
    resume: (t) => `Give precise resume advice for the role: ${t}. Include sections, bullet formulas, and common mistakes to avoid. Answer in Persian.`,
    coverletter: (t) => `Write a professional cover letter for the role: ${t}. Three short paragraphs. Answer in Persian.`,
    book: (t) => `Recommend 5 great books about: ${t}, with one line each on why to read them. Answer in Persian.`,
  };

  for (const [name, build] of Object.entries(geminiCmds)) {
    bot.command(name, async (ctx) => {
      const input = argText(ctx);
      if (!input) return ctx.reply("Usage: /" + name + " <topic>");
      await ctx.replyWithChatAction("typing");
      try {
        const out = await singlePrompt(build(input));
        return ctx.reply(out);
      } catch (err) {
        return ctx.reply(err.message === "NO_GEMINI_KEY" ? setupHint() : "Could not generate that.");
      }
    });
  }
}
