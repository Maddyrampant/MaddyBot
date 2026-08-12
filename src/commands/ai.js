import { reg, argText, replyLong } from "../utils.js";
import { singlePrompt, chat } from "../ai.js";

function txt(ctx) {
  return argText(ctx);
}

export default function register(bot, { memory }) {
  reg("ask", { usage: "<question>", desc: "Chat with the assistant", group: "ai" });
  reg("reset", { desc: "Clear your chat memory", group: "ai" });
  reg("translate", { usage: "<lang> <text>", desc: "Translate text", group: "ai" });
  reg("summarize", { usage: "<text>", desc: "Summarize text", group: "ai" });
  reg("grammar", { usage: "<text>", desc: "Fix grammar and spelling", group: "ai" });
  reg("rewrite", { usage: "<text>", desc: "Rewrite text more clearly", group: "ai" });
  reg("tone", { usage: "<tone> <text>", desc: "Rewrite text in a tone (formal, friendly, funny)", group: "ai" });
  reg("shorten", { usage: "<text>", desc: "Shorten text", group: "ai" });
  reg("expand", { usage: "<text>", desc: "Expand text into detail", group: "ai" });
  reg("ideas", { usage: "<topic>", desc: "Brainstorm ideas", group: "ai" });
  reg("essay", { usage: "<topic>", desc: "Write a short essay", group: "ai" });
  reg("poem", { usage: "<topic>", desc: "Write a short poem", group: "ai" });
  reg("story", { usage: "<topic>", desc: "Write a short story", group: "ai" });
  reg("joke", { desc: "Tell a joke", group: "ai" });
  reg("quote", { desc: "Inspiring quote", group: "ai" });
  reg("motivate", { desc: "Motivational message", group: "ai" });
  reg("fact", { desc: "Interesting fact", group: "ai" });
  reg("trivia", { desc: "Trivia question", group: "ai" });
  reg("riddle", { desc: "A riddle", group: "ai" });
  reg("explain", { usage: "<topic>", desc: "Explain simply", group: "ai" });
  reg("synonyms", { usage: "<word>", desc: "Synonyms for a word", group: "ai" });
  reg("antonyms", { usage: "<word>", desc: "Antonyms for a word", group: "ai" });
  reg("email", { usage: "<topic>", desc: "Draft an email", group: "ai" });
  reg("plan", { usage: "<goal>", desc: "Create a step-by-step plan", group: "ai" });

  const aiCommands = {
    translate: (t) => {
      const sp = t.split(/\s+/);
      const lang = sp.shift();
      return `Translate the following text into ${lang}. Reply with only the translation, nothing else.\n\n${sp.join(" ")}`;
    },
    summarize: (t) => `Summarize the following text concisely.\n\n${t}`,
    grammar: (t) => `Fix all grammar and spelling mistakes in the text below. Reply with only the corrected text.\n\n${t}`,
    rewrite: (t) => `Rewrite the following text to be clearer and more natural.\n\n${t}`,
    tone: (t) => {
      const sp = t.split(/\s+/);
      const tone = sp.shift();
      return `Rewrite the following text with a ${tone} tone. Reply with only the result.\n\n${sp.join(" ")}`;
    },
    shorten: (t) => `Shorten the following text while keeping the meaning.\n\n${t}`,
    expand: (t) => `Expand the following into a detailed version.\n\n${t}`,
    ideas: (t) => `Brainstorm creative ideas about: ${t}\nGive a bullet list of 5-8 ideas.`,
    essay: (t) => `Write a short essay (about 150 words) on: ${t}`,
    poem: (t) => `Write a short poem about: ${t}`,
    story: (t) => `Write a short story (about 150 words) about: ${t}`,
    joke: () => `Tell a short, clean joke.`,
    quote: () => `Give one inspiring quote with the author's name.`,
    motivate: () => `Give a short, uplifting motivational message.`,
    fact: () => `Give one interesting, true fun fact.`,
    trivia: () => `Give a trivia question with four options (A, B, C, D) and mark the correct answer.`,
    riddle: () => `Give a short riddle and put its answer below a divider line.`,
    explain: (t) => `Explain this topic in simple words, as if explaining to a 10 year old:\n${t}`,
    synonyms: (t) => `Give 8 synonyms for: ${t}`,
    antonyms: (t) => `Give 8 antonyms for: ${t}`,
    email: (t) => `Write a professional email about: ${t}\nInclude a subject line.`,
    plan: (t) => `Create a clear step-by-step plan to achieve: ${t}`,
  };

  for (const [name, build] of Object.entries(aiCommands)) {
    bot.command(name, async (ctx) => {
      const input = txt(ctx);
      if (build.length && !input) {
        return ctx.reply("Usage: /" + name + " " + needTextUsage(name));
      }
      await ctx.replyWithChatAction("typing");
      try {
        const prompt = build(input);
        const answer = await singlePrompt(prompt);
        await replyLong(answer)(ctx);
      } catch (err) {
        if (err.message === "NO_GEMINI_KEY") {
          return ctx.reply(setupHint());
        }
        console.error("AI command error " + name + ":", err);
        await ctx.reply("Something went wrong. Please try again.");
      }
    });
  }

  bot.command("ask", async (ctx) => {
    const id = userIdFrom(ctx);
    const input = txt(ctx);
    if (!input) return ctx.reply("Usage: /ask <your question>");
    await ctx.replyWithChatAction("typing");
    try {
      memory.push(id, input, "user");
      const answer = await chat(input, memory.get(id).slice(0, -1));
      memory.push(id, answer, "assistant");
      await replyLong(answer)(ctx);
    } catch (err) {
      if (err.message === "NO_GEMINI_KEY") {
        return ctx.reply(setupHint());
      }
      console.error("ask error:", err);
      await ctx.reply("Something went wrong. Please try again.");
    }
  });

  bot.command("reset", async (ctx) => {
    memory.clear(userIdFrom(ctx));
    await ctx.reply("Your chat memory was cleared.");
  });

  reg("analyze", { desc: "Deep analysis of your conversation with Madellin", group: "ai" });
  reg("mood", { desc: "Detect your mood from the conversation", group: "ai" });
  reg("summary", { desc: "Summarize the conversation so far", group: "ai" });

  const analysisCommands = {
    analyze: (t) =>
      "Analyze this conversation between User and Madellin. Give:\n" +
      "1) Main topics discussed\n" +
      "2) The user's mood and hidden needs\n" +
      "3) What the user really wants from Madellin\n" +
      "4) A smart suggestion for how to make the conversation more valuable to the user\n" +
      "Write it clearly in Persian.\n\n" + t,
    mood: (t) =>
      "Read this conversation and describe the user's current mood precisely: overall feeling, energy, stress level, and what changed it. " +
      "Then suggest the best way Madellin can respond right now to help this user feel better. " +
      "Answer in Persian.\n\n" + t,
    summary: (t) =>
      "Summarize this conversation in Persian: who the user is, what was discussed, what was decided, and any important promises or topics to follow up on later. " +
      "Keep it clear and short.\n\n" + t,
  };

  for (const [name, build] of Object.entries(analysisCommands)) {
    bot.command(name, async (ctx) => {
      const id = userIdFrom(ctx);
      const history = memory.get(id);
      if (!history.length) {
        return ctx.reply("There is no conversation to analyze yet. Talk to me a little first!");
      }
      await ctx.replyWithChatAction("typing");
      try {
        const transcript = history
          .map((m) => (m.role === "user" ? "User" : "Madellin") + ": " + m.text)
          .join("\n");
        const answer = await singlePrompt(build(transcript));
        await replyLong(answer)(ctx);
      } catch (err) {
        if (err.message === "NO_GEMINI_KEY") {
          return ctx.reply(setupHint());
        }
        console.error(name + " error:", err);
        await ctx.reply("Something went wrong. Please try again.");
      }
    });
  }
}

function needTextUsage(name) {
  const usages = {
    translate: "<lang> <text>",
    summarize: "<text>",
    grammar: "<text>",
    rewrite: "<text>",
    tone: "<tone> <text>",
    shorten: "<text>",
    expand: "<text>",
    ideas: "<topic>",
    essay: "<topic>",
    poem: "<topic>",
    story: "<topic>",
    explain: "<topic>",
    synonyms: "<word>",
    antonyms: "<word>",
    email: "<topic>",
    plan: "<goal>",
  };
  return usages[name] || "<text>";
}

function setupHint() {
  return "For smart chat I need a Gemini API key.\nAdd GEMINI_API_KEY to your .env file (free at https://aistudio.google.com), then restart the bot.";
}

function userIdFrom(ctx) {
  return ctx.from ? ctx.from.id : ctx.chat.id;
}
