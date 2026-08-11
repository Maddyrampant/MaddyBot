const MINUTE = 60 * 1000;

export function startScheduler(bot, store) {
  setInterval(async () => {
    const now = Date.now();
    for (const id of Object.keys(store.data.users || {})) {
      const user = store.data.users[id];
      const due = (user.reminders || []).filter((r) => r.at <= now);
      if (!due.length) continue;
      user.reminders = (user.reminders || []).filter((r) => r.at > now);
      store.save();
      for (const r of due) {
        try {
          await bot.api.sendMessage(r.chatId, `Reminder: ${r.text}`);
        } catch {
          // ignore delivery errors
        }
      }
    }
  }, 15 * 1000);
}

export { MINUTE };
