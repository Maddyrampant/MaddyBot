import { reg, argText, pick, randomInt } from "../utils.js";
import * as g from "../games.js";

const HANGMAN_WORDS = ["tehran", "computer", "sunflower", "keyboard", "mountains", "telegram", "guitar", "penguin", "chocolate", "astronaut", "library", "umbrella"];
const WORDS = ["planet", "winter", "coffee", "garden", "window", "tiger", "silver", "pencil", "bottle", "dragon", "melon", "island"];
const EMOJIS = ["\u{1F534}", "\u{1F7E2}", "\u{1F535}", "\u{1F7E1}"];
const QUIZ = [
  { q: "What is the capital of Japan?", options: ["Seoul", "Tokyo", "Beijing", "Bangkok"], answer: 1 },
  { q: "Which planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Saturn"], answer: 2 },
  { q: "What is 7 x 8?", options: ["54", "56", "64", "48"], answer: 1 },
  { q: "Who wrote the play Hamlet?", options: ["Dickens", "Shakespeare", "Tolstoy", "Homer"], answer: 1 },
  { q: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { q: "Which element has the symbol O?", options: ["Gold", "Oxygen", "Osmium", "Silver"], answer: 1 },
  { q: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "What is the fastest land animal?", options: ["Lion", "Cheetah", "Horse", "Leopard"], answer: 1 },
  { q: "Which country is the largest by area?", options: ["Canada", "USA", "China", "Russia"], answer: 3 },
  { q: "What does 'HTTP' stand for?", options: ["HyperText Transfer Protocol", "HighText Transfer Process", "HyperTool Text Protocol", "Home Transfer Text Protocol"], answer: 0 },
  { q: "Which bird is a symbol of peace?", options: ["Eagle", "Dove", "Crow", "Sparrow"], answer: 1 },
  { q: "What is the currency of the UK?", options: ["Euro", "Dollar", "Pound", "Yen"], answer: 2 },
  { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
  { q: "Which language is the most spoken in the world by native speakers?", options: ["English", "Spanish", "Mandarin", "Hindi"], answer: 2 },
  { q: "What is the hardest natural substance?", options: ["Gold", "Iron", "Diamond", "Quartz"], answer: 2 },
];

export default function register(bot) {
  setInterval(() => g.pruneOlderThan(), 60 * 60 * 1000);

  reg("guess", { usage: "[number]", desc: "Guess a number 1-100", group: "games" });
  reg("rps", { usage: "<rock|paper|scissors>", desc: "Rock-paper-scissors", group: "games" });
  reg("ttt", { usage: "[cell 1-9]", desc: "Tic-tac-toe vs the bot", group: "games" });
  reg("hangman", { usage: "[letter]", desc: "Hangman word game", group: "games" });
  reg("quiz", { usage: "[a|b|c|d]", desc: "Trivia quiz", group: "games" });
  reg("word", { usage: "[answer]", desc: "Unscramble the word", group: "games" });
  reg("memory", { usage: "[sequence]", desc: "Memory sequence game", group: "games" });
  reg("counter", { usage: "start | stop", desc: "Group counting game", group: "games" });

  bot.command("guess", async (ctx) => {
    const key = g.keyFor(ctx.chat.id, ctx.from.id, "guess");
    const input = argText(ctx);
    const n = parseInt(input, 10);
    if (!input || isNaN(n)) {
      g.set(key, { target: randomInt(1, 100), attempts: 0, updatedAt: Date.now() });
      return ctx.reply("New game! Guess a number between 1 and 100 with /guess <number>");
    }
    const session = g.get(key);
    if (!session) return ctx.reply("Start a game first with /guess");
    session.attempts += 1;
    session.updatedAt = Date.now();
    if (n === session.target) {
      g.remove(key);
      return ctx.reply(`Correct! The number was ${session.target} (${session.attempts} attempts).`);
    }
    return ctx.reply(n < session.target ? "Higher!" : "Lower!");
  });

  bot.command("rps", async (ctx) => {
    const input = argText(ctx).toLowerCase();
    if (!["rock", "paper", "scissors", "r", "p", "s"].includes(input)) {
      return ctx.reply("Usage: /rps rock|paper|scissors");
    }
    const move = input[0] === "r" ? "rock" : input[0] === "p" ? "paper" : "scissors";
    const botMove = pick(["rock", "paper", "scissors"]);
    let result;
    if (move === botMove) result = "draw";
    else if (
      (move === "rock" && botMove === "scissors") ||
      (move === "paper" && botMove === "rock") ||
      (move === "scissors" && botMove === "paper")
    ) {
      result = "win";
    } else {
      result = "lose";
    }
    const key = g.keyFor(ctx.chat.id, ctx.from.id, "rps");
    const stats = g.get(key) || { w: 0, l: 0, d: 0, updatedAt: Date.now() };
    stats[result === "win" ? "w" : result === "lose" ? "l" : "d"] += 1;
    stats.updatedAt = Date.now();
    g.set(key, stats);
    return ctx.reply(
      `You: ${move} | Bot: ${botMove}\nResult: ${result.toUpperCase()}\nScore: ${stats.w}W ${stats.l}L ${stats.d}D`
    );
  });

  bot.command("ttt", async (ctx) => {
    const key = g.keyFor(ctx.chat.id, ctx.from.id, "ttt");
    const input = argText(ctx);
    let session = g.get(key);
    if (!input) {
      session = { board: Array(9).fill(" "), updatedAt: Date.now() };
      g.set(key, session);
      return ctx.reply("New Tic-Tac-Toe game! You are X. /ttt <cell 1-9>\n\n" + boardStr(session.board));
    }
    if (!session) return ctx.reply("Start a game first with /ttt");
    const pos = parseInt(input, 10);
    if (isNaN(pos) || pos < 1 || pos > 9) return ctx.reply("Cell must be 1-9.");
    if (session.board[pos - 1] !== " ") return ctx.reply("That cell is already taken.");

    session.board[pos - 1] = "X";
    const w1 = winner(session.board);
    if (w1) {
      g.remove(key);
      return ctx.reply(boardStr(session.board) + "\n" + (w1 === "X" ? "You win!" : "I win!"));
    }
    if (session.board.every((c) => c !== " ")) {
      g.remove(key);
      return ctx.reply(boardStr(session.board) + "\nDraw.");
    }

    botTttMove(session.board);
    session.updatedAt = Date.now();
    const w2 = winner(session.board);
    if (w2) {
      g.remove(key);
      return ctx.reply(boardStr(session.board) + "\n" + (w2 === "O" ? "I win!" : "You win!"));
    }
    if (session.board.every((c) => c !== " ")) {
      g.remove(key);
      return ctx.reply(boardStr(session.board) + "\nDraw.");
    }
    return ctx.reply(boardStr(session.board));
  });

  bot.command("hangman", async (ctx) => {
    const key = g.keyFor(ctx.chat.id, ctx.from.id, "hangman");
    const input = argText(ctx).toLowerCase();
    let session = g.get(key);
    if (!input) {
      session = { word: pick(HANGMAN_WORDS), guessed: [], wrong: 0, updatedAt: Date.now() };
      g.set(key, session);
      return ctx.reply("New Hangman game! /hangman <letter>\n\n" + hangmanView(session));
    }
    if (!session) return ctx.reply("Start a game first with /hangman");
    const letter = input[0];
    if (session.guessed.includes(letter)) return ctx.reply("You already guessed that letter.");
    session.guessed.push(letter);
    session.updatedAt = Date.now();
    if (!session.word.includes(letter)) session.wrong += 1;
    if (session.wrong >= 7) {
      g.remove(key);
      return ctx.reply(hangmanView(session) + "\nGame over! The word was " + session.word);
    }
    if ([...session.word].every((c) => session.guessed.includes(c))) {
      g.remove(key);
      return ctx.reply("You solved it! The word was " + session.word);
    }
    return ctx.reply(hangmanView(session));
  });

  bot.command("quiz", async (ctx) => {
    const key = g.keyFor(ctx.chat.id, ctx.from.id, "quiz");
    const input = argText(ctx).toLowerCase();
    let session = g.get(key);
    if (!input) {
      const q = pick(QUIZ);
      g.set(key, { q, updatedAt: Date.now() });
      const opts = q.options.map((o, i) => `${String.fromCharCode(97 + i)}) ${o}`).join("\n");
      return ctx.reply(`${q.q}\n\n${opts}\n\nReply with /quiz a|b|c|d`);
    }
    if (!session) return ctx.reply("Start a quiz first with /quiz");
    const idx = ["a", "b", "c", "d"].indexOf(input);
    if (idx === -1) return ctx.reply("Reply with a, b, c or d.");
    g.remove(key);
    return ctx.reply(
      idx === session.q.answer
        ? "Correct!"
        : `Wrong. The answer was ${session.q.options[session.q.answer]}.`
    );
  });

  bot.command("word", async (ctx) => {
    const key = g.keyFor(ctx.chat.id, ctx.from.id, "word");
    const input = argText(ctx).toLowerCase();
    let session = g.get(key);
    if (!input) {
      const word = pick(WORDS);
      g.set(key, { word, scrambled: shuffle(word), updatedAt: Date.now() });
      return ctx.reply(`Unscramble the word: ${sessionScrambled(g.get(key))}\nReply with /word <answer>`);
    }
    if (!session) return ctx.reply("Start a game first with /word");
    g.remove(key);
    return ctx.reply(input === session.word ? "Correct!" : `Wrong. The word was ${session.word}.`);
  });

  bot.command("memory", async (ctx) => {
    const key = g.keyFor(ctx.chat.id, ctx.from.id, "memory");
    const input = argText(ctx);
    let session = g.get(key);
    if (!input) {
      g.set(key, { seq: [pick(EMOJIS)], updatedAt: Date.now() });
      return ctx.reply("Memorize the sequence, then repeat it with /memory <sequence>\n\n" + g.get(key).seq.join(" "));
    }
    if (!session) return ctx.reply("Start a game first with /memory");
    const guess = input.replace(/\s+/g, "");
    if (guess === session.seq.join("")) {
      session.seq.push(pick(EMOJIS));
      session.updatedAt = Date.now();
      if (session.seq.length >= 8) {
        g.remove(key);
        return ctx.reply("You won the memory game! Great job.");
      }
      return ctx.reply(`Correct! Next round:\n${session.seq.join(" ")}`);
    }
    g.remove(key);
    return ctx.reply(`Wrong! The sequence was ${session.seq.join(" ")}. You reached round ${session.seq.length}.`);
  });

  reg("counter", { usage: "start | stop", desc: "Group counting game", group: "games" });
  bot.command("counter", async (ctx) => {
    const action = argText(ctx).toLowerCase();
    const key = g.keyFor(ctx.chat.id, 0, "counter");
    if (action === "start") {
      g.set(key, { next: 1, updatedAt: Date.now() });
      return ctx.reply("Counting game started! Say 1, then let others continue with 2, 3, ...");
    }
    if (action === "stop") {
      g.remove(key);
      return ctx.reply("Counting game stopped.");
    }
    return ctx.reply("Usage: /counter start | stop");
  });

  bot.on("message:text", async (ctx, next) => {
    const key = g.keyFor(ctx.chat.id, 0, "counter");
    const session = g.get(key);
    if (!session) return next();
    const text = ctx.message.text.trim();
    if (/^\d+$/.test(text)) {
      const n = parseInt(text, 10);
      if (n === session.next) {
        session.next += 1;
        session.updatedAt = Date.now();
        if (session.next % 10 === 0) return ctx.reply(`${session.next} — nice counting!`);
        return;
      }
      return ctx.reply(`Wrong! The next number is ${session.next}.`);
    }
    return next();
  });
}

function boardStr(b) {
  const r = (i) => (b[i] === " " ? i + 1 : b[i]);
  return (
    `${r(0)} | ${r(1)} | ${r(2)}\n` +
    `--+---+--\n` +
    `${r(3)} | ${r(4)} | ${r(5)}\n` +
    `--+---+--\n` +
    `${r(6)} | ${r(7)} | ${r(8)}`
  );
}

function winner(b) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, c, d] of lines) {
    if (b[a] !== " " && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return null;
}

function botTttMove(b) {
  const empty = b.map((v, i) => (v === " " ? i : null)).filter((v) => v !== null);
  if (!empty.length) return;
  for (const i of empty) {
    const test = b.slice();
    test[i] = "O";
    if (winner(test) === "O") {
      b[i] = "O";
      return;
    }
  }
  for (const i of empty) {
    const test = b.slice();
    test[i] = "X";
    if (winner(test) === "X") {
      b[i] = "O";
      return;
    }
  }
  const center = empty.find((i) => i === 4);
  b[center !== undefined ? center : pick(empty)] = "O";
}

function hangmanView(s) {
  const word = [...s.word].map((c) => (s.guessed.includes(c) ? c : "_")).join(" ");
  const wrongLetters = s.guessed.filter((c) => !s.word.includes(c)).join(", ");
  return `Word: ${word}\nWrong guesses (${s.wrong}/7): ${wrongLetters || "-"}`;
}

function shuffle(str) {
  return [...str].sort(() => Math.random() - 0.5).join("");
}

function sessionScrambled(s) {
  return s.scrambled;
}
