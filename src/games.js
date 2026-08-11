const sessions = new Map();

export function get(key) {
  return sessions.get(key);
}

export function set(key, value) {
  sessions.set(key, value);
}

export function remove(key) {
  sessions.delete(key);
}

export function has(key) {
  return sessions.has(key);
}

export function keyFor(chatId, userId, game) {
  return `${chatId}:${userId}:${game}`;
}

export function pruneOlderThan(ms = 6 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (v.updatedAt && now - v.updatedAt > ms) sessions.delete(k);
  }
}
