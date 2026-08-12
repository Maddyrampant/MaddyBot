import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

function newUserData() {
  return {
    joinedAt: Date.now(),
    messageCount: 0,
    settings: { tone: "friendly", replyMode: "smart" },
    todos: [],
    notes: [],
    aliases: {},
    birthday: null,
    reminders: [],
    gameStats: {},
    expenses: [],
    budget: 0,
    water: { date: "", ml: 0 },
    moodLog: [],
    worklog: [],
    meetings: [],
    habits: [],
    contacts: [],
  };
}

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { users: {}, chatStats: {}, feedback: [], gameScores: {} };
    this.load();
  }

  load() {
    if (existsSync(this.file)) {
      try {
        const raw = JSON.parse(readFileSync(this.file, "utf8"));
        this.data = { users: {}, chatStats: {}, feedback: [], gameScores: {}, ...raw };
      } catch {
        this.data = { users: {}, chatStats: {}, feedback: [], gameScores: {} };
      }
    }
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  getUser(id) {
    if (!this.data.users[id]) {
      this.data.users[id] = newUserData();
    }
    return this.data.users[id];
  }

  touchUser(id) {
    const user = this.getUser(id);
    user.messageCount += 1;
    return user;
  }

  getChat(chatId) {
    if (!this.data.chatStats[chatId]) {
      this.data.chatStats[chatId] = { messageCount: 0, userCount: 0 };
    }
    return this.data.chatStats[chatId];
  }

  addFeedback(text) {
    this.data.feedback.push({ text, at: Date.now() });
    this.save();
  }

  /* --- HTML5 game scores --- */

  addGameScore(game, userId, score, name) {
    if (!this.data.gameScores[game]) this.data.gameScores[game] = {};
    const tbl = this.data.gameScores[game];
    const prev = tbl[userId];
    const isNewBest = !prev || score > prev.score;
    if (isNewBest) {
      tbl[userId] = { score, name: String(name || "").slice(0, 30), at: Date.now() };
      const user = this.getUser(userId);
      user.gameStats = user.gameStats || {};
      user.gameStats[game] = score;
      this.save();
    }
    return { isNewBest, best: isNewBest ? score : prev.score };
  }

  topGameScores(game, n = 10) {
    const tbl = this.data.gameScores[game] || {};
    return Object.entries(tbl)
      .map(([id, e]) => ({ id, ...e }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((e, i) => ({ rank: i + 1, id: e.id, name: e.name, score: e.score }));
  }

  bestGameScore(game, userId) {
    const e = (this.data.gameScores[game] || {})[userId];
    return e ? e.score : 0;
  }
}
