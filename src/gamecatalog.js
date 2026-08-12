export const GAMES = [
  { key: "snake", title: "Snake", emoji: "🐍", file: "snake.html", desc: "مار بازی؛ با مار پول‌ها را بخور و بلند شو", best: "امتیاز" },
  { key: "twenty48", title: "2048", emoji: "🎲", file: "twenty48.html", desc: "کاشی‌ها را ترکیب کن و به ۲۰۴۸ برس", best: "امتیاز" },
  { key: "pong", title: "Pong", emoji: "🏓", file: "pong.html", desc: "بازی کلاسیک پینگ‌پنگ در برابر ربات", best: "امتیاز" },
  { key: "breakout", title: "Breakout", emoji: "🧱", file: "breakout.html", desc: "آجرها را با توپ بشکن و سطح‌ها را رد کن", best: "امتیاز" },
  { key: "memory", title: "Memory Match", emoji: "🃏", file: "memory.html", desc: "جفت‌های یکسان را با کمترین حرکت پیدا کن", best: "امتیاز" },
  { key: "mines", title: "Minesweeper", emoji: "💣", file: "mines.html", desc: "میدان مین؛ همه مین‌ها را بدون انفجار پیدا کن", best: "امتیاز" },
  { key: "simon", title: "Simon Says", emoji: "🔴", file: "simon.html", desc: "دنباله رنگ‌ها را حفظ کن و تکرار کن", best: "مرحله" },
  { key: "tetris", title: "Tetris", emoji: "🧩", file: "tetris.html", desc: "قطعه‌ها را بچین و خط کامل بساز", best: "امتیاز" },
  { key: "whack", title: "Whack-a-Mole", emoji: "🔨", file: "whack.html", desc: "در ۳۰ ثانیه موش‌ها را بزن، بمب را نزن", best: "امتیاز" },
  { key: "flappy", title: "Flappy", emoji: "🐦", file: "flappy.html", desc: "پرنده را بین لوله‌ها هدایت کن", best: "امتیاز" },
];

export function gameByKey(key) {
  return GAMES.find((g) => g.key === key) || null;
}

export function gameShortNames() {
  return GAMES.map((g) => g.key);
}
