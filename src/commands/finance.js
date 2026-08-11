import { reg, argText, uid, fmtNum } from "../utils.js";

export default function register(bot, { store }) {
  reg("expense", { usage: "<amount> <category> [note]", desc: "Record an expense", group: "finance" });
  reg("expenses", { usage: "[category] | total | del <n>", desc: "List or total expenses", group: "finance" });
  reg("budget", { usage: "set <amount> | status", desc: "Monthly budget tracking", group: "finance" });
  reg("split", { usage: "<total> <people>", desc: "Split a bill", group: "finance" });
  reg("tip", { usage: "<bill> [percent]", desc: "Tip calculator", group: "finance" });
  reg("compound", { usage: "<principal> <rate%> <years>", desc: "Compound interest calculator", group: "finance" });
  reg("loan", { usage: "<amount> <rate%> <years>", desc: "Loan monthly payment", group: "finance" });
  reg("vat", { usage: "<amount> <percent>", desc: "VAT calculator", group: "finance" });

  bot.command("expense", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const parts = argText(ctx).split(/\s+/);
    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0) return ctx.reply("Usage: /expense <amount> <category> [note]");
    const category = (parts[1] || "other").toLowerCase();
    const note = parts.slice(2).join(" ");
    user.expenses.push({ id: uid(), amount, category, note, date: Date.now() });
    store.save();
    return ctx.reply(`Expense recorded: ${fmtNum(amount)} (${category})${note ? " - " + note : ""}`);
  });

  bot.command("expenses", (ctx) => {
    const user = store.getUser(ctx.from.id);
    if (!user.expenses.length) return ctx.reply("No expenses yet. /expense <amount> <category>");
    const parts = argText(ctx).split(/\s+/);
    const sub = (parts[0] || "").toLowerCase();
    if (sub === "total") {
      const byCat = {};
      for (const e of user.expenses) byCat[e.category] = (byCat[e.category] || 0) + e.amount;
      const total = user.expenses.reduce((s, e) => s + e.amount, 0);
      return ctx.reply(
        "Spending by category:\n" +
          Object.entries(byCat).map(([c, a]) => `${c}: ${fmtNum(a)}`).join("\n") +
          `\nTotal: ${fmtNum(total)}`
      );
    }
    if (sub === "del") {
      const n = parseInt(parts[1], 10);
      if (!n || !user.expenses[n - 1]) return ctx.reply("Invalid index.");
      user.expenses.splice(n - 1, 1);
      store.save();
      return ctx.reply("Expense deleted.");
    }
    const list = sub ? user.expenses.filter((e) => e.category === sub) : user.expenses;
    if (!list.length) return ctx.reply("No expenses in that category.");
    return ctx.reply(
      list
        .map(
          (e, i) =>
            `${i + 1}. ${fmtNum(e.amount)} - ${e.category}${e.note ? " (" + e.note + ")" : ""} (${new Date(e.date).toLocaleDateString("en-GB")})`
        )
        .join("\n")
    );
  });

  bot.command("budget", (ctx) => {
    const user = store.getUser(ctx.from.id);
    const m = argText(ctx).match(/^set\s+(\d+(?:\.\d+)?)$/i);
    if (m) {
      user.budget = parseFloat(m[1]);
      store.save();
      return ctx.reply(`Monthly budget set to ${fmtNum(user.budget)}.`);
    }
    if (!user.budget) return ctx.reply("No budget set. Use /budget set <amount>");
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const spent = user.expenses.filter((e) => e.date >= monthStart).reduce((s, e) => s + e.amount, 0);
    const left = user.budget - spent;
    return ctx.reply(
      `Budget: ${fmtNum(user.budget)}\nSpent this month: ${fmtNum(spent)}\nRemaining: ${fmtNum(left)}` +
        (left < 0 ? " (over budget!)" : "")
    );
  });

  bot.command("split", (ctx) => {
    const m = argText(ctx).match(/^(\d+(?:\.\d+)?)\s+(\d+)$/);
    if (!m) return ctx.reply("Usage: /split <total> <people>");
    const each = parseFloat(m[1]) / Math.max(1, parseInt(m[2], 10));
    return ctx.reply(`Total: ${fmtNum(parseFloat(m[1]))} across ${m[2]} people\nEach pays: ${fmtNum(each)}`);
  });

  bot.command("tip", (ctx) => {
    const m = argText(ctx).match(/^(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?$/);
    if (!m) return ctx.reply("Usage: /tip <bill amount> [tip percent]");
    const bill = parseFloat(m[1]);
    const pct = m[2] ? parseFloat(m[2]) : 15;
    const tip = (bill * pct) / 100;
    return ctx.reply(`Bill: ${fmtNum(bill)}\nTip (${pct}%): ${fmtNum(tip)}\nTotal: ${fmtNum(bill + tip)}`);
  });

  bot.command("compound", (ctx) => {
    const m = argText(ctx).match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
    if (!m) return ctx.reply("Usage: /compound <principal> <annual rate %> <years>");
    const p = parseFloat(m[1]);
    const r = parseFloat(m[2]) / 100;
    const t = parseFloat(m[3]);
    const amount = p * Math.pow(1 + r, t);
    return ctx.reply(
      `Principal: ${fmtNum(p)}\nRate: ${(r * 100).toFixed(2)}% for ${t} years\nFuture value (yearly compounding): ${fmtNum(amount)}\nInterest earned: ${fmtNum(amount - p)}`
    );
  });

  bot.command("loan", (ctx) => {
    const m = argText(ctx).match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
    if (!m) return ctx.reply("Usage: /loan <amount> <annual rate %> <years>");
    const P = parseFloat(m[1]);
    const annual = parseFloat(m[2]) / 100;
    const years = parseFloat(m[3]);
    const n = years * 12;
    const r = annual / 12;
    const payment = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    const total = payment * n;
    return ctx.reply(
      `Loan: ${fmtNum(P)} at ${(annual * 100).toFixed(2)}% for ${years} years\nMonthly payment: ${fmtNum(payment)}\nTotal paid: ${fmtNum(total)}\nInterest: ${fmtNum(total - P)}`
    );
  });

  bot.command("vat", (ctx) => {
    const m = argText(ctx).match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
    if (!m) return ctx.reply("Usage: /vat <amount> <vat percent>");
    const amount = parseFloat(m[1]);
    const pct = parseFloat(m[2]);
    return ctx.reply(
      `Amount: ${fmtNum(amount)}\nVAT (${pct}%): ${fmtNum((amount * pct) / 100)}\nIncluding VAT: ${fmtNum(amount * (1 + pct / 100))}\nExcluding VAT (reverse): ${fmtNum(amount / (1 + pct / 100))}`
    );
  });
}
