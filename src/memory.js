import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export class MemoryStore {
  constructor(file, maxTurns = 10) {
    this.file = file;
    this.maxTurns = maxTurns;
    this.data = {};
    this.load();
  }

  load() {
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(readFileSync(this.file, "utf8"));
      } catch {
        this.data = {};
      }
    }
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  get(id) {
    return this.data[id] || [];
  }

  push(id, text, role = "user") {
    const history = this.get(id);
    history.push({ role, text });
    const limit = this.maxTurns * 2;
    if (history.length > limit) {
      history.splice(0, history.length - limit);
    }
    this.data[id] = history;
    this.save();
    return history;
  }

  clear(id) {
    delete this.data[id];
    this.save();
  }
}
