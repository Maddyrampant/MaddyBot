/* GameSDK — shared helper for MaddyBot HTML5 games.
 * Handles Telegram WebApp init data, signed URL auth, and score submission. */
(function () {
  "use strict";

  function qs() {
    const out = {};
    (location.search || "")
      .replace(/^\?/, "")
      .split("&")
      .forEach((kv) => {
        if (!kv) return;
        const i = kv.indexOf("=");
        const k = i < 0 ? kv : kv.slice(0, i);
        const v = i < 0 ? "" : kv.slice(i + 1);
        try {
          out[decodeURIComponent(k)] = decodeURIComponent(v);
        } catch {}
      });
    return out;
  }

  const params = qs();
  const tg = typeof Telegram !== "undefined" && Telegram.WebApp ? Telegram.WebApp : null;

  let initData = tg && tg.initData ? tg.initData : null;
  if (!initData && params.tgWebAppData) initData = params.tgWebAppData;

  const tgUser =
    tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
  const uid = params.user || (tgUser && tgUser.id) || null;
  const sig = params.sig || null;
  const name = params.name ? decodeURIComponent(params.name) : (tgUser && (tgUser.first_name || tgUser.username)) || "";

  window.GameSDK = {
    userId: uid,
    name,
    params,
    tg,

    ready() {
      if (tg) {
        try {
          tg.ready();
        } catch (e) {}
      }
    },

    expand() {
      if (tg) {
        try {
          tg.expand();
        } catch (e) {}
      }
    },

    setBgColor(c) {
      if (tg) {
        try {
          tg.setBackgroundColor(c);
        } catch (e) {}
      }
    },

    /* Submit a finished game score. Higher is always better. */
    async submit(game, score) {
      const headers = { "Content-Type": "application/json" };
      if (initData) headers["X-Telegram-Init-Data"] = initData;
      if (uid && sig) {
        headers["X-Game-User"] = uid;
        headers["X-Game-Sig"] = sig;
      }
      try {
        const r = await fetch("/api/game/score", {
          method: "POST",
          headers,
          body: JSON.stringify({ game, score: Math.max(0, Math.floor(Number(score) || 0)) }),
        });
        const j = await r.json();
        if (j.ok && window.TelegramGame && j.isNewBest !== false) {
          try {
            window.TelegramGame.setResult(j.best);
          } catch (e) {}
        }
        return j;
      } catch (e) {
        return { ok: false, top: [] };
      }
    },

    /* Fetch the top-N leaderboard for a game. */
    async top(game) {
      const headers = {};
      if (initData) headers["X-Telegram-Init-Data"] = initData;
      if (uid && sig) {
        headers["X-Game-User"] = uid;
        headers["X-Game-Sig"] = sig;
      }
      try {
        const r = await fetch("/api/game/top?game=" + encodeURIComponent(game), { headers });
        return await r.json();
      } catch (e) {
        return { ok: false, top: [] };
      }
    },

    /* Store the local best so games can show "your best" offline. */
    localBest(game) {
      try {
        const k = "maddybest_" + game;
        return Number(localStorage.getItem(k) || 0);
      } catch (e) {
        return 0;
      }
    },

    saveLocalBest(game, score) {
      try {
        const k = "maddybest_" + game;
        const prev = Number(localStorage.getItem(k) || 0);
        if (score > prev) localStorage.setItem(k, String(score));
      } catch (e) {}
    },
  };

  if (tg) {
    try {
      tg.ready();
    } catch (e) {}
  }
})();
