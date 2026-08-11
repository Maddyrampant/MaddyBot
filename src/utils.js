export const registry = {};

const GROUPS = [
  ["core", "General"],
  ["ai", "AI Assistant"],
  ["text", "Text Tools"],
  ["math", "Math"],
  ["datetime", "Date & Time"],
  ["web", "Web"],
  ["fun", "Fun"],
  ["games", "Games"],
  ["personal", "Personal"],
  ["group", "Group Admin"],
];

export function reg(name, meta) {
  registry[name] = { name, usage: "", desc: "", group: "core", ...meta };
  return name;
}

export function groupLabel(key) {
  const found = GROUPS.find(([k]) => k === key);
  return found ? found[1] : key;
}

export function allGroups() {
  return GROUPS;
}

export function commandsByGroup(group) {
  return Object.values(registry)
    .filter((c) => c.group === group)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function argText(ctx) {
  return (ctx.match || "").trim();
}

export function replyLong(text, extra = {}) {
  return async (ctx) => {
    const chunks = [];
    const lines = String(text).split("\n");
    let cur = "";
    for (const line of lines) {
      if ((cur + "\n" + line).trim().length > 3800) {
        chunks.push(cur);
        cur = line;
      } else {
        cur = cur ? cur + "\n" + line : line;
      }
    }
    if (cur.trim()) chunks.push(cur);
    if (!chunks.length) chunks.push("No result.");
    for (const chunk of chunks.slice(0, 4)) {
      await ctx.reply(chunk, extra);
    }
  };
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function isAdmin(user) {
  return ["administrator", "creator"].includes(user.status);
}
