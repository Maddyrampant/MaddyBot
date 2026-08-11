import { randomInt as rnd, pick, clamp } from "../utils.js";
import { randomUUID } from "crypto";
import { reg, argText } from "../utils.js";

const UNITS = {
  m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254,
  kg: 1, g: 0.001, mg: 0.000001, lb: 0.45359237, oz: 0.028349523125, t: 1000,
  b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4,
};
const TEMP = ["c", "f", "k"];

export default function register(bot) {
  reg("calc", { usage: "<expression>", desc: "Evaluate math expression", group: "math" });
  reg("random", { usage: "[min] <max>", desc: "Random number", group: "math" });
  reg("dice", { usage: "[sides]", desc: "Roll a die", group: "math" });
  reg("coin", { desc: "Flip a coin", group: "math" });
  reg("choose", { usage: "<a, b, c>", desc: "Pick one from options", group: "math" });
  reg("password", { usage: "[length]", desc: "Generate a strong password", group: "math" });
  reg("uuid", { desc: "Generate a UUID", group: "math" });
  reg("prime", { usage: "<n>", desc: "Check if a number is prime", group: "math" });
  reg("fib", { usage: "<n>", desc: "First n Fibonacci numbers", group: "math" });
  reg("factorial", { usage: "<n>", desc: "Factorial of n", group: "math" });
  reg("convert", { usage: "<value> <from> <to>", desc: "Convert units", group: "math" });

  bot.command("calc", (ctx) => {
    const expr = argText(ctx);
    if (!expr) return ctx.reply("Usage: /calc <expression>\nExample: /calc (2+3)*4^2");
    try {
      return ctx.reply(String(evalExpr(expr)));
    } catch (err) {
      return ctx.reply("Could not parse that expression. Try something like /calc (2+3)*4^2");
    }
  });

  bot.command("random", (ctx) => {
    const parts = argText(ctx).trim().split(/\s+/).map(Number);
    if (!parts.length || parts.some(isNaN)) return ctx.reply("Usage: /random <min> <max> or /random <max>");
    let [a, b] = parts.length === 1 ? [1, parts[0]] : parts;
    if (a > b) [a, b] = [b, a];
    return ctx.reply(`Random number: <b>${rnd(a, b)}</b>`, { parse_mode: "HTML" });
  });

  bot.command("dice", (ctx) => {
    const sides = parseInt(argText(ctx), 10) || 6;
    return ctx.reply(`You rolled a d${sides}: <b>${rnd(1, sides)}</b>`, { parse_mode: "HTML" });
  });

  bot.command("coin", (ctx) => {
    const faces = ["Heads", "Tails"];
    const face = pick(faces);
    const label = face === "Heads" ? "\u{1F1F8}\u{1F1E6}" : "\u{1F1F9}\u{1F1F3}";
    return ctx.reply(`${label} ${face}`);
  });

  bot.command("choose", (ctx) => {
    const raw = argText(ctx);
    if (!raw) return ctx.reply("Usage: /choose apple, banana, orange");
    const options = raw.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) return ctx.reply("Give at least two options separated by commas.");
    return ctx.reply(`I choose: <b>${pick(options)}</b>`, { parse_mode: "HTML" });
  });

  bot.command("password", (ctx) => {
    const len = clamp(parseInt(argText(ctx), 10) || 12, 6, 64);
    const sets = [
      "abcdefghijklmnopqrstuvwxyz",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "0123456789",
      "!@#$%^&*()_-+=<>?",
    ];
    let pass = "";
    for (let i = 0; i < len; i++) {
      const set = sets[i % 4];
      pass += set[Math.floor(Math.random() * set.length)];
    }
    pass = [...pass].sort(() => Math.random() - 0.5).join("");
    return ctx.reply(`<code>${pass}</code>`, { parse_mode: "HTML" });
  });

  bot.command("uuid", (ctx) => ctx.reply(randomUUID()));

  bot.command("prime", (ctx) => {
    const n = parseInt(argText(ctx), 10);
    if (!n) return ctx.reply("Usage: /prime <n>");
    const isPrime = n > 1 && (() => {
      for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
      return true;
    })();
    return ctx.reply(`${n} is ${isPrime ? "prime" : "not prime"}.`);
  });

  bot.command("fib", (ctx) => {
    const n = clamp(parseInt(argText(ctx), 10) || 10, 1, 100);
    const fib = [0, 1];
    for (let i = 2; i < n; i++) fib.push(fib[i - 1] + fib[i - 2]);
    return ctx.reply(fib.slice(0, n).join(", "));
  });

  bot.command("factorial", (ctx) => {
    const n = parseInt(argText(ctx), 10);
    if (!n && n !== 0) return ctx.reply("Usage: /factorial <n>");
    if (n < 0 || n > 170) return ctx.reply("n must be between 0 and 170.");
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return ctx.reply(`${n}! = ${r}`);
  });

  bot.command("convert", (ctx) => {
    const parts = argText(ctx).trim().split(/\s+/);
    if (parts.length !== 3) return ctx.reply("Usage: /convert 5 km m\nSupported: length, weight, data, temperature (c/f/k)");
    const value = parseFloat(parts[0]);
    const from = parts[1].toLowerCase();
    const to = parts[2].toLowerCase();
    if (isNaN(value)) return ctx.reply("Invalid value.");

    if (TEMP.includes(from) && TEMP.includes(to)) {
      return ctx.reply(`${value}${from} = ${convertTemp(value, from, to).toFixed(2)}${to}`);
    }
    if (UNITS[from] && UNITS[to]) {
      const result = (value * UNITS[from]) / UNITS[to];
      return ctx.reply(`${value}${from} = ${round(result)}${to}`);
    }
    return ctx.reply("Unsupported units. Try /convert 5 km m or /convert 100 c f");
  });
}

function round(n) {
  if (!isFinite(n)) return "?";
  if (Math.abs(n) < 1e-6 || Math.abs(n) > 1e6) return n.toExponential(4);
  return Math.round(n * 1e6) / 1e6;
}

function convertTemp(value, from, to) {
  let c;
  if (from === "c") c = value;
  else if (from === "f") c = ((value - 32) * 5) / 9;
  else c = value - 273.15;
  if (to === "c") return c;
  if (to === "f") return (c * 9) / 5 + 32;
  return c + 273.15;
}

function tokenize(input) {
  const tokens = [];
  const re = /(\d+\.?\d*|\.\d+|[a-zA-Z]+|[+\-*/%^(),])/g;
  let m;
  while ((m = re.exec(input))) {
    const t = m[1];
    if (/^\d/.test(t) || /^\.\d/.test(t)) {
      tokens.push({ type: "num", value: parseFloat(t) });
    } else if (/^[a-zA-Z]+$/.test(t)) {
      const l = t.toLowerCase();
      if (l === "pi") tokens.push({ type: "const", value: Math.PI });
      else if (l === "e") tokens.push({ type: "const", value: Math.E });
      else if (["sin", "cos", "tan", "sqrt", "log", "ln", "abs", "round", "floor", "ceil", "exp", "asin", "acos", "atan"].includes(l)) {
        tokens.push({ type: "fn", value: l });
      } else {
        throw new Error("unknown token " + t);
      }
    } else {
      tokens.push({ type: "op", value: t });
    }
  }
  return tokens;
}

export function evalExpr(input) {
  const tokens = tokenize(input);
  if (!tokens.length) throw new Error("empty");
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expectOp = (v) => {
    const t = peek();
    if (!t || t.value !== v) throw new Error("syntax");
    return next();
  };

  function parseExpr() {
    let left = parseTerm();
    while (peek() && (peek().value === "+" || peek().value === "-")) {
      const op = next().value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (peek() && (peek().value === "*" || peek().value === "/" || peek().value === "%")) {
      const op = next().value;
      const right = parseFactor();
      if (op === "*") left = left * right;
      else if (op === "/") left = left / right;
      else left = left % right;
    }
    return left;
  }
  function parseFactor() {
    const left = parseUnary();
    if (peek() && peek().value === "^") {
      next();
      const right = parseFactor();
      return Math.pow(left, right);
    }
    return left;
  }
  function parseUnary() {
    const t = peek();
    if (t && (t.value === "-" || t.value === "+")) {
      next();
      const v = parseUnary();
      return t.value === "-" ? -v : v;
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = next();
    if (!t) throw new Error("syntax");
    if (t.type === "num" || t.type === "const") return t.value;
    if (t.type === "fn") {
      expectOp("(");
      const args = [];
      if (peek() && peek().value !== ")") {
        args.push(parseExpr());
        while (peek() && peek().value === ",") {
          next();
          args.push(parseExpr());
        }
      }
      expectOp(")");
      return applyFn(t.value, args);
    }
    if (t.value === "(") {
      const v = parseExpr();
      expectOp(")");
      return v;
    }
    throw new Error("syntax");
  }
  return parseExpr();
}

function applyFn(name, args) {
  const [a, b] = args;
  const fns = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    log: (x) => Math.log10(x), ln: Math.log,
    round: Math.round, floor: Math.floor, ceil: Math.ceil,
  };
  const fn = fns[name];
  if (!fn) throw new Error("unknown function");
  return b === undefined ? fn(a) : fn(a, b);
}
