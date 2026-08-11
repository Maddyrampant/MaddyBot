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
    this.data = { users: {}, chatStats: {}, feedback: [] };
    this.load();
  }

  load() {
    if (existsSync(this.file)) {
      try {
        const raw = JSON.parse(readFileSync(this.file, "utf8"));
        this.data = { users: {}, chatStats: {}, feedback: [], ...raw };
      } catch {
        this.data = { users: {}, chatStats: {}, feedback: [] };
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
}
