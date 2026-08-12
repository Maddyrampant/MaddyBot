"use strict";

(() => {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || "";

  const $ = (id) => document.getElementById(id);
  const state = {
    user: null,
    status: null,
    groups: [],
    messages: [],
    busy: false,
  };

  /* ---------- Telegram SDK ---------- */
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("bg_color");
    tg.setBackgroundColor?.("bg_color");
    tg.onEvent?.("themeChanged", () => applyTheme());
    tg.onEvent?.("viewportChanged", () => {});
  }

  function applyTheme() {
    const scheme = tg?.colorScheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = scheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = scheme === "dark" ? "#0a0a0f" : "#eef0ff";
  }

  /* ---------- API ---------- */
  async function api(path, opts = {}) {
    const headers = { "X-Telegram-Init-Data": initData };
    if (opts.body) headers["Content-Type"] = "application/json";
    const res = await fetch(path, { ...opts, headers });
    if (!res.ok) {
      let err = "error";
      try {
        err = (await res.json()).error || err;
      } catch {}
      throw new Error(err);
    }
    return res;
  }

  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  /* ---------- Navigation ---------- */
  const viewNames = { dashboard: "داشبورد", chat: "گفتگو", memories: "حافظه", commands: "فرمان‌ها" };

  function switchView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    $("view-" + name).classList.add("active");
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    $("headerSub").textContent = viewNames[name] || "";
    if (name === "memories") loadMemories();
    if (name === "chat") $("chatInput").focus();
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard(data) {
    const name = data.user.first_name || data.user.username || "دوست";
    $("userInitial").textContent = (name[0] || "؟").toUpperCase();
    $("heroTitle").textContent = `سلام، ${name}! 👋`;
    $("heroSub").textContent = data.user.id === data.isOwner ? "صاحب مادی‌بات" : "مادلین منتظر شماست";

    const s = data.status;
    const chips = [
      ["فرمان‌ها", s.commands],
      ["خاطرات", s.memories],
      ["نسخه", s.version],
      ["مدل", s.model],
    ];
    $("statusChips").innerHTML = chips
      .map(([k, v]) => `<span class="chip">${k}: <b>${v}</b></span>`)
      .join("");
  }

  /* ---------- Chat ---------- */
  function addBubble(text, who, { waiting = false } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + who;
    if (waiting) {
      wrap.classList.add("waiting");
      wrap.innerHTML = `<span class="dots"><i></i><i></i><i></i></span>`;
    } else {
      wrap.textContent = text;
    }
    $("messages").appendChild(wrap);
    scrollChat();
    return wrap;
  }

  function scrollChat() {
    const sc = $("chatScroll");
    sc.scrollTop = sc.scrollHeight;
  }

  async function sendChat() {
    const input = $("chatInput");
    const text = input.value.trim();
    if (!text || state.busy) return;
    input.value = "";
    state.busy = true;
    addBubble(text, "user");
    const bubble = addBubble("", "bot", { waiting: true });

    try {
      const res = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      bubble.classList.remove("waiting");
      bubble.classList.add("typing");
      bubble.textContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let evt;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.delta) bubble.textContent += evt.delta;
          if (evt.error === "no_key") bubble.textContent += "\n⚠️ کلید AI تنظیم نشده.";
          else if (evt.error) bubble.textContent += "\n⚠️ خطا در دریافت پاسخ.";
        }
        scrollChat();
      }
    } catch (err) {
      bubble.classList.remove("waiting", "typing");
      bubble.textContent = "⚠️ اتصال برقرار نشد. " + (err.message === "unauthorized" ? "دوباره از تلگرام باز کن." : "");
      toast("خطا در ارتباط");
    } finally {
      bubble.classList.remove("waiting", "typing");
      if (!bubble.textContent) bubble.textContent = "…";
      state.busy = false;
    }
  }

  /* ---------- Memories ---------- */
  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(Number(ts));
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(d);
  }

  async function loadMemories() {
    try {
      const res = await api("/api/memories");
      const data = await res.json();
      const list = data.memories || [];
      $("memEmpty").style.display = list.length ? "none" : "block";
      const wrap = $("memList");
      wrap.innerHTML = "";
      if (!list.length) return;
      for (const m of list) {
        const card = document.createElement("div");
        card.className = "card mem-card";
        const del = document.createElement("button");
        del.className = "del-btn";
        del.title = "حذف";
        del.setAttribute("aria-label", "حذف خاطره");
        del.innerHTML =
          '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        del.addEventListener("click", () => deleteMemory(m.id));
        card.innerHTML =
          `<div class="mem-text">${escapeHtml(m.text)}</div>` +
          `<div class="mem-meta">${m.type || "fact"} · ${fmtTime(m.created_at)}</div>`;
        card.appendChild(del);
        wrap.appendChild(card);
      }
    } catch {
      toast("خطا در بارگذاری خاطرات");
    }
  }

  async function deleteMemory(id) {
    try {
      await api("/api/memories?id=" + id, { method: "DELETE" });
      toast("خاطره حذف شد");
      loadMemories();
    } catch {
      toast("حذف نشد");
    }
  }

  /* ---------- Commands ---------- */
  function renderCommands(groups) {
    $("cmdCount").textContent = groups.reduce((n, g) => n + g.commands.length, 0);
    const wrap = $("cmdList");
    wrap.innerHTML = "";
    wrap.className = "list";
    for (const g of groups) {
      const det = document.createElement("details");
      det.className = "group-card card";
      det.innerHTML = `<summary>${escapeHtml(g.label)} <span class="chip">${g.commands.length}</span></summary>`;
      const body = document.createElement("div");
      for (const c of g.commands) {
        const btn = document.createElement("button");
        btn.className = "cmd-item";
        const usage = c.usage ? ` <span class="cmd-usage">${escapeHtml(c.usage)}</span>` : "";
        btn.innerHTML = `<span class="cmd-name">/${escapeHtml(c.name)}</span>${usage}<span class="cmd-desc">${escapeHtml(c.desc)}</span>`;
        btn.addEventListener("click", () => {
          toast(`/${c.name}${c.usage ? " " + c.usage : ""}`);
        });
        body.appendChild(btn);
      }
      det.appendChild(body);
      wrap.appendChild(det);
    }
  }

  function filterCommands(q) {
    q = q.trim().toLowerCase();
    document.querySelectorAll(".group-card").forEach((det) => {
      const items = [...det.querySelectorAll(".cmd-item")];
      let shown = 0;
      for (const it of items) {
        const hit = !q || it.textContent.toLowerCase().includes(q);
        it.style.display = hit ? "" : "none";
        if (hit) shown++;
      }
      det.style.display = shown ? "" : "none";
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  /* ---------- Boot ---------- */
  async function boot() {
    applyTheme();
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
    document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.goto)));
    $("sendBtn").addEventListener("click", sendChat);
    $("chatInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
    $("memRefresh").addEventListener("click", loadMemories);
    $("cmdSearch").addEventListener("input", (e) => filterCommands(e.target.value));

    try {
      const res = await api("/api/init");
      const data = await res.json();
      if (!data.ok) throw new Error("not_ok");
      state.user = data.user;
      state.status = data.status;
      state.groups = data.groups;
      renderDashboard(data);
      renderCommands(data.groups);
    } catch (err) {
      $("heroSub").textContent =
        err.message === "unauthorized"
          ? "برای استفاده، ربات را داخل تلگرام باز کنید."
          : "خطا در اتصال به سرور.";
      toast(err.message === "unauthorized" ? "داخل تلگرام باز کنید" : "اتصال برقرار نشد");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
