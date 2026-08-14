import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "games", "data");
await mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRIVIA_CATEGORIES = [
  { id: 9, name: "general" },
  { id: 15, name: "videogames" },
  { id: 17, name: "science" },
  { id: 18, name: "computers" },
  { id: 19, name: "math" },
  { id: 22, name: "geography" },
  { id: 23, name: "history" },
  { id: 27, name: "animals" },
];

async function fetchTrivia(existing) {
  const questions = existing.slice();
  const haveCount = new Map();
  for (const q of existing) haveCount.set(q.cat, (haveCount.get(q.cat) || 0) + 1);
  for (const cat of TRIVIA_CATEGORIES) {
    if ((haveCount.get(cat.name) || 0) >= 30) {
      console.log(`[trivia] ${cat.name}: already have ${haveCount.get(cat.name)} (skip)`);
      continue;
    }
    try {
      const url = `https://opentdb.com/api.php?amount=50&category=${cat.id}&type=multiple`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.response_code !== 0) throw new Error(`response_code ${data.response_code}`);
      for (const q of data.results) {
        const correct = decode(q.correct_answer);
        const options = shuffle([...q.incorrect_answers.map(decode), correct]);
        questions.push({
          cat: cat.name,
          q: decode(q.question),
          options,
          a: options.indexOf(correct),
        });
      }
      console.log(`[trivia] ${cat.name}: +${data.results.length}`);
    } catch (err) {
      console.log(`[trivia] ${cat.name} skipped: ${err.message}`);
    }
    await sleep(6000);
  }
  return questions;
}

function decode(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&eacute;/g, "é")
    .replace(/&oacute;/g, "ó")
    .replace(/&iacute;/g, "í")
    .replace(/&aacute;/g, "á")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchWords() {
  const urls = [
    "https://raw.githubusercontent.com/tabatkins/wordle-list/main/words",
    "https://raw.githubusercontent.com/3b1b/videos/master/_2022/wordle/data/allowed_words.txt",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const words = text
        .split(/\r?\n/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => /^[a-z]{5}$/.test(w));
      if (words.length < 500) throw new Error(`only ${words.length} words`);
      console.log(`[words] ${words.length} words from ${url}`);
      return words;
    } catch (err) {
      console.log(`[words] source failed: ${err.message}`);
    }
  }
  return [];
}

let existing = [];
try {
  existing = JSON.parse(
    await readFile(join(outDir, "trivia.json"), "utf8")
  ).questions;
} catch {}
const trivia = await fetchTrivia(existing);
await writeFile(
  join(outDir, "trivia.json"),
  JSON.stringify({ fetched: new Date().toISOString(), questions: trivia }),
  "utf8"
);
console.log(`[trivia] saved ${trivia.length} questions to data/games/trivia.json`);

const words = await fetchWords();
if (words.length) {
  await writeFile(join(outDir, "words.json"), JSON.stringify({ words }), "utf8");
  console.log(`[words] saved ${words.length} words to data/games/words.json`);
}
