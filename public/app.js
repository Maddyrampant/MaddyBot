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
    imageBase64: null,
    imageMime: "image/jpeg",
    imageMeta: null,
    pendingPrompt: null,
    tool: "memories",
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

  async function apiJSON(path, opts = {}) {
    const res = await api(path, opts);
    return res.json();
  }

  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  function fmtNum(n) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(n) || 0);
  }

  function fmtDate(ts) {
    if (!ts) return "";
    return new Date(Number(ts)).toLocaleDateString("fa-IR");
  }

  /* ---------- Navigation ---------- */
  const viewNames = {
    dashboard: "داشبورد",
    chat: "گفتگو",
    games: "بازی‌ها",
    image: "استودیوی تصویر",
    tools: "ابزارها",
  };

  function switchView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    $("view-" + name).classList.add("active");
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    $("headerSub").textContent = viewNames[name] || "";
    if (name === "games") loadGames();
    if (name === "image") { if (!state.imageBase64) { /* keep */ } }
    if (name === "tools") renderTool(state.tool);
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

  /* ---------- Games ---------- */
  async function loadGames() {
    try {
      const data = await apiJSON("/api/games");
      const games = data.games || [];
      $("gameCount").textContent = games.length;
      const wrap = $("gameList");
      wrap.innerHTML = "";
      for (const g of games) {
        const card = document.createElement("div");
        card.className = "game-card glass";
        const top3 = (g.top || []).slice(0, 3)
          .map((t, i) => `<div class="lb-row">${i + 1}. ${escapeHtml(t.name)} — <b>${t.score}</b></div>`)
          .join("");
        card.innerHTML =
          `<div class="game-emoji">${g.emoji}</div>` +
          `<div class="game-title">${escapeHtml(g.title)}</div>` +
          `<div class="game-desc">${escapeHtml(g.desc)}</div>` +
          `<div class="game-best">رکورد من: <b>${g.userBest || 0}</b></div>` +
          (top3 ? `<div class="game-lb">${top3}</div>` : "") +
          `<button class="btn btn-primary btn-block">▶️ بازی</button>`;
        card.querySelector("button").addEventListener("click", () => openGame(g));
        wrap.appendChild(card);
      }
    } catch {
      toast("خطا در بارگذاری بازی‌ها");
    }
  }

  function openGame(g) {
    const ov = document.createElement("div");
    ov.className = "game-overlay";
    ov.innerHTML =
      `<div class="game-top"><button class="game-back" aria-label="بازگشت">✖️</button>` +
      `<span>${escapeHtml(g.emoji)} ${escapeHtml(g.title)}</span>` +
      `<button class="game-score-btn" aria-label="رکوردها">🏆</button></div>` +
      `<iframe src="${g.url}" allow="autoplay; fullscreen" frameborder="0"></iframe>`;
    ov.querySelector(".game-back").addEventListener("click", () => ov.remove());
    ov.querySelector(".game-score-btn").addEventListener("click", () => {
      if (tg) tg.showAlert("🏆 رکوردهای " + g.title + ":\n" + (g.top || []).map((t) => `${t.rank}. ${t.name} — ${t.score}`).join("\n") || "هنوز رکوردی نیست.");
    });
    document.body.appendChild(ov);
  }

  /* ---------- Image studio ---------- */
  const LOCAL_ACTIONS = [
    { key: "compress", label: "💾 کم‌حجم" },
    { key: "square", label: "⬜ مربع" },
    { key: "circle", label: "⚪ دایره" },
    { key: "sticker", label: "🧩 استیکر" },
    { key: "bw", label: "🌚 سیاه‌وسفید" },
    { key: "sepia", label: "🖼 سپیا" },
    { key: "rotate", label: "🔄 چرخش" },
    { key: "flip", label: "↔️ آینه" },
    { key: "blur", label: "🌫 محو" },
    { key: "sharpen", label: "✨ شارپ" },
    { key: "brightness", label: "☀️ روشنایی" },
    { key: "contrast", label: "🌗 کنتراست" },
    { key: "saturate", label: "🎨 اشباع" },
    { key: "thumbnail", label: "🔎 بندانگشتی" },
    { key: "resize", label: "📐 ۱۰۸۰" },
    { key: "crop:1:1", label: "✂️ ۱:۱" },
    { key: "crop:16:9", label: "✂️ ۱۶:۹" },
    { key: "crop:4:3", label: "✂️ ۴:۳" },
    { key: "upscale", label: "🔍 بزرگ‌نمایی" },
    { key: "format:jpg", label: "JPG" },
    { key: "format:png", label: "PNG" },
    { key: "format:webp", label: "WEBP" },
    { key: "watermark", label: "🏷 واترمارک", needsPrompt: true },
  ];

  const AI_ACTIONS = [
    { key: "imagine", label: "✨ تولید از متن", needsPrompt: true, noImage: true },
    { key: "edit", label: "🖌 ویرایش هوشمند", needsPrompt: true },
    { key: "removebg", label: "➖ حذف پس‌زمینه" },
    { key: "restore", label: "🛠 ترمیم" },
    { key: "style:cartoon", label: "🎨 کارتون" },
    { key: "style:anime", label: "⛩ انیمه" },
    { key: "style:neon", label: "💡 نئون" },
    { key: "style:oil", label: "🖌 رنگ‌روغن" },
    { key: "upscaleai", label: "🚀 بزرگ AI" },
    { key: "describe", label: "📝 توضیح", textResult: true },
    { key: "ocr", label: "🔤 استخراج متن", textResult: true },
    { key: "qrscan", label: "🔳 اسکن QR", textResult: true },
    { key: "askphoto", label: "❓ سؤال از تصویر", needsPrompt: true, textResult: true },
  ];

  function renderImageChips() {
    $("imgLocalChips").innerHTML = LOCAL_ACTIONS
      .map((a) => `<button class="chip-btn" data-key="${a.key}">${a.label}</button>`)
      .join("");
    $("imgAIChips").innerHTML = AI_ACTIONS
      .map((a) => `<button class="chip-btn" data-key="${a.key}">${a.label}</button>`)
      .join("");
    document.querySelectorAll("#imgLocalChips .chip-btn").forEach((b) =>
      b.addEventListener("click", () => runImageAction(b.dataset.key))
    );
    document.querySelectorAll("#imgAIChips .chip-btn").forEach((b) =>
      b.addEventListener("click", () => runImageAction(b.dataset.key))
    );
  }

  function dataUrl(base64, mime) {
    return "data:" + (mime || "image/jpeg") + ";base64," + base64;
  }

  function showImagePreview(base64, mime, meta) {
    state.imageBase64 = base64;
    state.imageMime = mime || state.imageMime;
    state.imageMeta = meta || null;
    $("imgView").src = dataUrl(base64, mime);
    $("imgMeta").textContent = meta && meta.w ? `${meta.w}×${meta.h} · ${(base64.length * 0.75 / 1024 / 1024).toFixed(2)}MB` : "";
    $("imgPreview").classList.remove("hidden");
    $("imgActions").classList.remove("hidden");
  }

  function setImgStatus(text, isError) {
    const el = $("imgStatus");
    el.textContent = text;
    el.className = "img-status" + (isError ? " error" : "");
  }

  function imgResultToPreview(data) {
    showImagePreview(data.base64, data.mime, data.meta);
    setImgStatus("✅ انجام شد." + (data.text ? " " + data.text.slice(0, 200) : ""));
  }

  async function loadImageFromUrl(url) {
    setImgStatus("در حال دریافت تصویر…");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("http");
      const blob = await res.blob();
      if (!/^image\//.test(blob.type) && !/image/.test(res.headers.get("content-type") || "")) {
        throw new Error("not_image");
      }
      const reader = new FileReader();
      const d = await new Promise((ok, bad) => {
        reader.onload = () => ok(reader.result);
        reader.onerror = bad;
        reader.readAsDataURL(blob);
      });
      const mime = blob.type || "image/jpeg";
      showImagePreview(d.split(",")[1], mime, null);
      setImgStatus("✅ تصویر بارگذاری شد.");
    } catch (err) {
      setImgStatus("⚠️ نتوانستم از این لینک تصویر بخوانم (ممکن است اجازهٔ دسترسی نداشته باشد).", true);
    }
  }

  async function runImageAction(rawKey) {
    const key = String(rawKey);
    const [a] = key.split(":");
    const act = LOCAL_ACTIONS.find((x) => x.key === key) || AI_ACTIONS.find((x) => x.key === key);
    if (!act) return;
    if (act.noImage && !state.imageBase64 && a !== "imagine") {
      setImgStatus("اول یک تصویر انتخاب کن.", true);
      return;
    }
    if (act.needsPrompt) {
      state.pendingPrompt = { key, act };
      const bar = $("imgPromptBar");
      bar.classList.remove("hidden");
      const ph = act.noImage
        ? "توضیح تصویری که می‌خواهی بسازی…"
        : a === "askphoto"
          ? "سؤال خود را دربارهٔ تصویر بنویس…"
          : a === "watermark"
            ? "متن واترمارک را بنویس…"
            : "دستور تغییر را بنویس… (مثلاً: آسمان را آبی کن)";
      $("imgPrompt").placeholder = ph;
      $("imgPrompt").value = "";
      $("imgPrompt").focus();
      return;
    }
    await executeImageAction({ key, act, prompt: "" });
  }

  async function executeImageAction({ key, act, prompt }) {
    const parts = key.split(":");
    const a = parts[0];
    const p1 = parts.slice(1).join(":");
    setImgStatus("در حال پردازش…");
    try {
      let body;
      let path;
      if (act.noImage) {
        path = "/api/image/imagine";
        body = { prompt };
      } else {
        if (!state.imageBase64) return setImgStatus("اول یک تصویر انتخاب کن.", true);
        body = { imageBase64: state.imageBase64, mime: state.imageMime };
        if (act.textResult) {
          path = "/api/image/ai";
          body.action = a;
          body.prompt = prompt;
        } else if (a === "edit" || a === "style") {
          path = "/api/image/ai";
          body.action = a;
          body.prompt = p1 || prompt;
        } else {
          path = "/api/image";
          body.action = a;
          body.params = paramsFor(a, p1, prompt);
        }
      }
      const data = await apiJSON(path, { method: "POST", body: JSON.stringify(body) });
      if (!data.ok) throw new Error(data.error || "fail");
      if (data.kind === "text") {
        setImgStatus(data.text);
        return;
      }
      imgResultToPreview(data);
    } catch (err) {
      const msg = String(err.message || err);
      const friendly =
        msg === "NO_GEMINI_KEY" ? "⚠️ کلید AI تنظیم نشده است." :
        msg === "AI_TIMEOUT" ? "⏳ پاسخ AI دیر شد؛ دوباره تلاش کن." :
        msg === "IMAGE_EMPTY" ? "⚠️ نتوانستم تصویر تولید کنم." :
        "";
      setImgStatus(friendly || "⚠️ خطا: " + msg.slice(0, 200), true);
    }
  }

  function paramsFor(a, param, prompt) {
    switch (a) {
      case "format": return { format: param || "webp" };
      case "rotate": return { deg: "90" };
      case "brightness": return { val: "10" };
      case "contrast": return { val: "10" };
      case "saturate": return { val: "20" };
      case "blur": return { sigma: "5" };
      case "resize": return { width: "1080" };
      case "crop": return { ratio: param || "1:1" };
      case "watermark": return { text: prompt || "MaddyBot" };
      case "upscale": return { scale: "2" };
      default: return {};
    }
  }

  function initImage() {
    renderImageChips();
    $("imgPickBtn").addEventListener("click", () => $("imgFile").click());
    $("imgFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const d = reader.result;
        showImagePreview(d.split(",")[1], f.type || "image/jpeg", null);
        setImgStatus("✅ تصویر انتخاب شد.");
      };
      reader.readAsDataURL(f);
    });
    $("imgUrlBtn").addEventListener("click", () => {
      const url = $("imgUrl").value.trim();
      if (url) loadImageFromUrl(url);
    });
    $("imgUrl").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("imgUrlBtn").click();
    });
    $("imgSampleBtn").addEventListener("click", () => loadImageFromUrl("https://picsum.photos/800/600"));
    $("imgDownload").addEventListener("click", () => {
      if (!state.imageBase64) return;
      const a = document.createElement("a");
      const ext = (state.imageMime || "").includes("png") ? "png" : "jpg";
      a.href = dataUrl(state.imageBase64, state.imageMime);
      a.download = "maddy_result." + ext;
      a.click();
    });
    $("imgReset").addEventListener("click", () => {
      state.imageBase64 = null;
      state.imageMime = "image/jpeg";
      $("imgView").src = "";
      $("imgPreview").classList.add("hidden");
      $("imgActions").classList.add("hidden");
      $("imgStatus").textContent = "";
    });
    $("imgPromptGo").addEventListener("click", () => {
      if (!state.pendingPrompt) return;
      const { key, act } = state.pendingPrompt;
      state.pendingPrompt = null;
      $("imgPromptBar").classList.add("hidden");
      executeImageAction({ key, act, prompt: $("imgPrompt").value.trim() });
    });
    $("imgPromptCancel").addEventListener("click", () => {
      state.pendingPrompt = null;
      $("imgPromptBar").classList.add("hidden");
    });
  }

  /* ---------- Tools hub ---------- */
  const TOOLS = [
    { id: "memories", label: "🧠 خاطرات" },
    { id: "todos", label: "✅ کارها" },
    { id: "notes", label: "📝 یادداشت‌ها" },
    { id: "reminders", label: "⏰ یادآورها" },
    { id: "finance", label: "💰 مخارج" },
    { id: "water", label: "💧 آب" },
    { id: "mood", label: "😊 حال‌وهوا" },
    { id: "habits", label: "🎯 عادت‌ها" },
    { id: "commands", label: "📋 فرمان‌ها" },
  ];

  function renderToolNav() {
    $("toolNav").innerHTML = TOOLS.map((t) =>
      `<button class="tool-pill${state.tool === t.id ? " active" : ""}" data-tool="${t.id}">${t.label}</button>`
    ).join("");
    document.querySelectorAll(".tool-pill").forEach((b) =>
      b.addEventListener("click", () => {
        state.tool = b.dataset.tool;
        renderToolNav();
        renderTool(state.tool);
      })
    );
  }

  function renderTool(id) {
    renderToolNav();
    const panel = $("toolPanel");
    panel.innerHTML = "";
    const fn = {
      memories: renderMemories,
      todos: renderTodos,
      notes: renderNotes,
      reminders: renderReminders,
      finance: renderFinance,
      water: renderWater,
      mood: renderMood,
      habits: renderHabits,
      commands: renderCommands,
    }[id];
    if (fn) fn(panel);
  }

  function formBar(placeholder, submitLabel, onSubmit, extra = "") {
    const wrap = document.createElement("div");
    wrap.className = "tool-form";
    const input = document.createElement("input");
    input.className = "search-input";
    input.placeholder = placeholder;
    input.enterkeyhint = "send";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    const btn = document.createElement("button");
    btn.className = "btn btn-primary btn-small";
    btn.textContent = submitLabel;
    btn.addEventListener("click", submit);
    function submit() {
      const v = input.value.trim();
      if (!v) return;
      input.value = "";
      onSubmit(v);
    }
    wrap.append(input, btn);
    if (extra) wrap.appendChild(extra);
    return wrap;
  }

  function listItem(text, meta, actions) {
    const row = document.createElement("div");
    row.className = "tool-row card";
    const body = document.createElement("div");
    body.className = "tool-row-body";
    body.innerHTML = `<div>${text}</div>${meta ? `<div class="muted">${meta}</div>` : ""}`;
    row.appendChild(body);
    for (const act of actions || []) row.appendChild(act);
    return row;
  }

  function delBtn(fn) {
    const b = document.createElement("button");
    b.className = "del-btn";
    b.title = "حذف";
    b.setAttribute("aria-label", "حذف");
    b.innerHTML =
      '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    b.addEventListener("click", fn);
    return b;
  }

  function empty(text) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = text;
    return p;
  }

  /* ---- memories ---- */
  async function renderMemories(panel) {
    const head = document.createElement("div");
    head.className = "tool-head";
    head.innerHTML = "<h3>🧠 خاطرات من</h3>";
    const refresh = document.createElement("button");
    refresh.className = "btn btn-small";
    refresh.textContent = "🔄";
    refresh.addEventListener("click", () => renderMemories(panel));
    head.appendChild(refresh);
    panel.appendChild(head);
    panel.appendChild(empty("در حال بارگذاری…"));
    try {
      const data = await apiJSON("/api/memories");
      const list = data.memories || [];
      panel.innerHTML = "";
      panel.appendChild(head);
      if (!list.length) {
        panel.appendChild(empty("خاطره‌ای ثبت نشده. با مادلین چت کن تا کم‌کم شما را بشناسد."));
        return;
      }
      for (const m of list) {
        const meta = `${m.type || "fact"} · ${new Date(Number(m.created_at)).toLocaleString("fa-IR")}`;
        panel.appendChild(listItem(escapeHtml(m.text), meta, [delBtn(async () => {
          await apiJSON("/api/memories?id=" + m.id, { method: "DELETE" });
          renderMemories(panel);
        })]));
      }
    } catch {
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(empty("خطا در بارگذاری خاطرات"));
    }
  }

  /* ---- todos ---- */
  async function renderTodos(panel) {
    const head = document.createElement("div");
    head.innerHTML = "<h3>✅ کارهای من</h3>";
    panel.appendChild(head);
    panel.appendChild(formBar("کار جدید…", "افزودن", async (text) => {
      await apiJSON("/api/todos", { method: "POST", body: JSON.stringify({ text }) });
      renderTodos(panel);
    }));
    panel.appendChild(empty("در حال بارگذاری…"));
    try {
      const data = await apiJSON("/api/todos");
      const list = data.todos || [];
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(formBar("کار جدید…", "افزودن", async (text) => {
        await apiJSON("/api/todos", { method: "POST", body: JSON.stringify({ text }) });
        renderTodos(panel);
      }));
      if (!list.length) {
        panel.appendChild(empty("لیست کارهایت خالی است."));
        return;
      }
      for (const t of list) {
        const row = document.createElement("div");
        row.className = "tool-row card" + (t.done ? " done" : "");
        const chk = document.createElement("button");
        chk.className = "chk" + (t.done ? " on" : "");
        chk.textContent = t.done ? "✓" : "";
        chk.title = "انجام شد";
        chk.setAttribute("aria-label", "انجام شد");
        chk.addEventListener("click", async () => {
          await apiJSON("/api/todos", { method: "POST", body: JSON.stringify({ action: "toggle", id: t.id }) });
          renderTodos(panel);
        });
        row.appendChild(chk);
        const body = document.createElement("div");
        body.className = "tool-row-body";
        body.innerHTML = `<div>${escapeHtml(t.text)}${t.priority ? ` <span class="chip">${t.priority}</span>` : ""}</div>`;
        row.appendChild(body);
        row.appendChild(delBtn(async () => {
          await apiJSON("/api/todos", { method: "POST", body: JSON.stringify({ action: "del", id: t.id }) });
          renderTodos(panel);
        }));
        panel.appendChild(row);
      }
    } catch {
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(empty("خطا در بارگذاری کارها"));
    }
  }

  /* ---- notes ---- */
  async function renderNotes(panel) {
    const head = document.createElement("div");
    head.innerHTML = "<h3>📝 یادداشت‌ها</h3>";
    panel.appendChild(head);
    panel.appendChild(formBar("یادداشت جدید…", "ذخیره", async (text) => {
      await apiJSON("/api/notes", { method: "POST", body: JSON.stringify({ text }) });
      renderNotes(panel);
    }));
    panel.appendChild(empty("در حال بارگذاری…"));
    try {
      const data = await apiJSON("/api/notes");
      const list = data.notes || [];
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(formBar("یادداشت جدید…", "ذخیره", async (text) => {
        await apiJSON("/api/notes", { method: "POST", body: JSON.stringify({ text }) });
        renderNotes(panel);
      }));
      if (!list.length) {
        panel.appendChild(empty("یادداشتی نداری."));
        return;
      }
      for (const n of list) {
        panel.appendChild(listItem(escapeHtml(n.text), fmtDate(n.createdAt), [delBtn(async () => {
          await apiJSON("/api/notes", { method: "POST", body: JSON.stringify({ action: "del", id: n.id }) });
          renderNotes(panel);
        })]));
      }
    } catch {
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(empty("خطا در بارگذاری یادداشت‌ها"));
    }
  }

  /* ---- reminders ---- */
  async function renderReminders(panel) {
    const head = document.createElement("div");
    head.innerHTML = "<h3>⏰ یادآورها</h3>";
    panel.appendChild(head);
    const row = document.createElement("div");
    row.className = "tool-form";
    const text = document.createElement("input");
    text.className = "search-input";
    text.placeholder = "متن یادآوری…";
    const mins = document.createElement("input");
    mins.className = "search-input min-input";
    mins.type = "number";
    mins.min = "1";
    mins.value = "60";
    mins.placeholder = "دقیقه";
    const btn = document.createElement("button");
    btn.className = "btn btn-primary btn-small";
    btn.textContent = "ثبت";
    btn.addEventListener("click", async () => {
      const t = text.value.trim();
      const m = Number(mins.value);
      if (!t || !m || m < 1) return toast("متن و دقیقه را بنویس");
      await apiJSON("/api/reminders", { method: "POST", body: JSON.stringify({ text: t, minutes: m }) });
      renderReminders(panel);
    });
    row.append(text, mins, btn);
    panel.appendChild(row);
    panel.appendChild(empty("در حال بارگذاری…"));
    try {
      const data = await apiJSON("/api/reminders");
      const list = data.reminders || [];
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(row);
      if (!list.length) {
        panel.appendChild(empty("یادآوری فعالی نداری. یادآورها در تلگرام برایت ارسال می‌شوند."));
        return;
      }
      for (const r of list) {
        const meta = `در ${r.remainingMin} دقیقهٔ دیگر`;
        panel.appendChild(listItem(escapeHtml(r.text), meta, [delBtn(async () => {
          await apiJSON("/api/reminders", { method: "POST", body: JSON.stringify({ action: "del", id: r.id }) });
          renderReminders(panel);
        })]));
      }
    } catch {
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(empty("خطا در بارگذاری یادآورها"));
    }
  }

  /* ---- finance ---- */
  async function renderFinance(panel) {
    const head = document.createElement("div");
    head.innerHTML = "<h3>💰 مخارج و بودجه</h3>";
    panel.appendChild(head);
    panel.appendChild(empty("در حال بارگذاری…"));
    let budget, expenses;
    try {
      budget = await apiJSON("/api/budget");
      expenses = await apiJSON("/api/expenses");
    } catch {
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(empty("خطا در بارگذاری مخارج"));
      return;
    }
    panel.innerHTML = "";
    panel.appendChild(head);

    const stat = document.createElement("div");
    stat.className = "finance-stats";
    stat.innerHTML =
      `<div class="card"><span class="muted">بودجه</span><b>${fmtNum(budget.budget)}</b></div>` +
      `<div class="card"><span class="muted">خرج ماه</span><b>${fmtNum(budget.spent)}</b></div>` +
      `<div class="card"><span class="muted">باقی‌مانده</span><b>${fmtNum(budget.left)}</b></div>` +
      `<div class="card"><span class="muted">کل مخارج</span><b>${fmtNum(expenses.total)}</b></div>`;
    panel.appendChild(stat);

    const budgetBar = formBar("بودجهٔ ماهانه را تنظیم کن…", "ثبت", async (v) => {
      const amount = Number(v);
      if (!Number.isFinite(amount) || amount <= 0) return toast("عدد وارد کن");
      await apiJSON("/api/budget", { method: "POST", body: JSON.stringify({ amount }) });
      renderFinance(panel);
    });
    panel.appendChild(budgetBar);

    const addRow = document.createElement("div");
    addRow.className = "tool-form expense-form";
    const amount = document.createElement("input");
    amount.className = "search-input";
    amount.type = "number";
    amount.min = "0";
    amount.placeholder = "مبلغ";
    const cat = document.createElement("input");
    cat.className = "search-input";
    cat.placeholder = "دسته (مثلاً خوراک)";
    const note = document.createElement("input");
    note.className = "search-input";
    note.placeholder = "توضیح (اختیاری)";
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-primary btn-small";
    addBtn.textContent = "ثبت هزینه";
    addBtn.addEventListener("click", async () => {
      const a = Number(amount.value);
      if (!Number.isFinite(a) || a <= 0) return toast("مبلغ را درست وارد کن");
      await apiJSON("/api/expenses", {
        method: "POST",
        body: JSON.stringify({ amount: a, category: cat.value || "other", note: note.value }),
      });
      renderFinance(panel);
    });
    addRow.append(amount, cat, note, addBtn);
    panel.appendChild(addRow);

    const list = expenses.expenses || [];
    if (!list.length) {
      panel.appendChild(empty("هزینه‌ای ثبت نشده."));
      return;
    }
    for (const e of list) {
      const meta = `${escapeHtml(e.category)}${e.note ? " · " + escapeHtml(e.note) : ""} · ${fmtDate(e.date)}`;
      panel.appendChild(listItem(`<b>${fmtNum(e.amount)}</b>`, meta, [delBtn(async () => {
        await apiJSON("/api/expenses", { method: "POST", body: JSON.stringify({ action: "del", id: e.id }) });
        renderFinance(panel);
      })]));
    }
  }

  /* ---- water ---- */
  async function renderWater(panel) {
    const head = document.createElement("div");
    head.innerHTML = "<h3>💧 آب امروز</h3>";
    panel.appendChild(head);
    panel.appendChild(empty("در حال بارگذاری…"));
    try {
      const data = await apiJSON("/api/water");
      const water = data.water || { ml: 0 };
      const goal = data.goal || 2500;
      const pct = Math.min(100, Math.round((water.ml / goal) * 100));
      panel.innerHTML = "";
      panel.appendChild(head);
      const bar = document.createElement("div");
      bar.className = "water-bar";
      bar.innerHTML = `<div class="water-fill" style="width:${pct}%"></div>`;
      const stats = document.createElement("div");
      stats.className = "finance-stats";
      stats.innerHTML = `<div class="card"><b>${water.ml}</b><span class="muted">میلی‌لیتر</span></div><div class="card"><b>${pct}%</b><span class="muted">از هدف</span></div>`;
      panel.appendChild(bar);
      panel.appendChild(stats);
      const row = document.createElement("div");
      row.className = "chip-row";
      for (const ml of [200, 250, 500, 1000]) {
        const b = document.createElement("button");
        b.className = "chip-btn";
        b.textContent = `+${ml}ml`;
        b.addEventListener("click", async () => {
          await apiJSON("/api/water", { method: "POST", body: JSON.stringify({ ml }) });
          renderWater(panel);
        });
        row.appendChild(b);
      }
      const reset = document.createElement("button");
      reset.className = "chip-btn";
      reset.textContent = "↩️ صفر کن";
      reset.addEventListener("click", async () => {
        await apiJSON("/api/water", { method: "POST", body: JSON.stringify({ action: "reset" }) });
        renderWater(panel);
      });
      row.appendChild(reset);
      panel.appendChild(row);
    } catch {
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(empty("خطا در بارگذاری آب"));
    }
  }

  /* ---- mood ---- */
  async function renderMood(panel) {
    const head = document.createElement("div");
    head.innerHTML = "<h3>😊 حال‌وهوای امروز</h3>";
    panel.appendChild(head);
    panel.appendChild(empty("در حال بارگذاری…"));
    try {
      const data = await apiJSON("/api/mood");
      const moodLog = data.moodLog || [];
      const today = new Date().toLocaleDateString("en-CA");
      const todayEntry = moodLog.find((e) => e.date === today);
      panel.innerHTML = "";
      panel.appendChild(head);
      const faces = ["😞", "😕", "😐", "🙂", "🤩"];
      const row = document.createElement("div");
      row.className = "chip-row mood-row";
      faces.forEach((f, i) => {
        const b = document.createElement("button");
        b.className = "mood-btn" + (todayEntry && todayEntry.mood === i + 1 ? " active" : "");
        b.textContent = f;
        b.title = i + 1;
        b.addEventListener("click", async () => {
          await apiJSON("/api/mood", { method: "POST", body: JSON.stringify({ mood: i + 1 }) });
          renderMood(panel);
        });
        row.appendChild(b);
      });
      panel.appendChild(row);
      const last7 = moodLog.slice(-7).reverse().map((e) => faces[e.mood - 1]).join(" ");
      if (last7) panel.appendChild(listItem("۷ روز اخیر", last7));
      if (!moodLog.length) panel.appendChild(empty("هنوز حال‌وهوایی ثبت نکرده‌ای."));
    } catch {
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(empty("خطا در بارگذاری حال‌وهوا"));
    }
  }

  /* ---- habits ---- */
  async function renderHabits(panel) {
    const head = document.createElement("div");
    head.innerHTML = "<h3>🎯 عادت‌ها</h3>";
    panel.appendChild(head);
    panel.appendChild(formBar("عادت جدید…", "ایجاد", async (name) => {
      await apiJSON("/api/habits", { method: "POST", body: JSON.stringify({ name }) });
      renderHabits(panel);
    }));
    panel.appendChild(empty("در حال بارگذاری…"));
    try {
      const data = await apiJSON("/api/habits");
      const habits = data.habits || [];
      const today = new Date().toLocaleDateString("en-CA");
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(formBar("عادت جدید…", "ایجاد", async (name) => {
        await apiJSON("/api/habits", { method: "POST", body: JSON.stringify({ name }) });
        renderHabits(panel);
      }));
      if (!habits.length) {
        panel.appendChild(empty("عادتی نداری. مثلاً: ورزش، مطالعه، مدیتیشن…"));
        return;
      }
      for (const h of habits) {
        const doneToday = (h.dates || []).includes(today);
        const row = document.createElement("div");
        row.className = "tool-row card" + (doneToday ? " done" : "");
        const chk = document.createElement("button");
        chk.className = "chk" + (doneToday ? " on" : "");
        chk.textContent = doneToday ? "✓" : "";
        chk.title = "انجام امروز";
        chk.addEventListener("click", async () => {
          await apiJSON("/api/habits", { method: "POST", body: JSON.stringify({ action: "toggle", id: h.id }) });
          renderHabits(panel);
        });
        row.appendChild(chk);
        const body = document.createElement("div");
        body.className = "tool-row-body";
        body.innerHTML = `<div>${escapeHtml(h.name)}</div><div class="muted">زنجیره ${h.streak} روز · مجموع ${(h.dates || []).length}</div>`;
        row.appendChild(body);
        row.appendChild(delBtn(async () => {
          await apiJSON("/api/habits", { method: "POST", body: JSON.stringify({ action: "del", id: h.id }) });
          renderHabits(panel);
        }));
        panel.appendChild(row);
      }
    } catch {
      panel.innerHTML = "";
      panel.appendChild(head);
      panel.appendChild(empty("خطا در بارگذاری عادت‌ها"));
    }
  }

  /* ---- commands ---- */
  function renderCommands(panel) {
    const head = document.createElement("div");
    head.innerHTML = "<h3>📋 فرمان‌ها</h3>";
    panel.appendChild(head);
    const search = document.createElement("input");
    search.className = "search-input";
    search.type = "search";
    search.placeholder = "جستجوی فرمان…";
    search.addEventListener("input", (e) => filterCommands(e.target.value));
    panel.appendChild(search);
    const wrap = document.createElement("div");
    wrap.id = "cmdList";
    wrap.className = "list";
    panel.appendChild(wrap);
    renderCommandsList(wrap);
  }

  function renderCommandsList(wrap) {
    wrap.innerHTML = "";
    const groups = state.groups || [];
    wrap.appendChild(empty(`${groups.reduce((n, g) => n + g.commands.length, 0)} فرمان در ${groups.length} گروه`));
    for (const g of groups) {
      const det = document.createElement("details");
      det.className = "group-card card";
      det.innerHTML = `<summary>${escapeHtml(g.label)} <span class="chip">${g.commands.length}</span></summary>`;
      const body = document.createElement("div");
      for (const c of g.commands) {
        const item = document.createElement("button");
        item.className = "cmd-item";
        const usage = c.usage ? ` <span class="cmd-usage">${escapeHtml(c.usage)}</span>` : "";
        item.innerHTML = `<span class="cmd-name">/${escapeHtml(c.name)}</span>${usage}<span class="cmd-desc">${escapeHtml(c.desc)}</span>`;
        item.addEventListener("click", () => toast(`/${c.name}${c.usage ? " " + c.usage : ""}`));
        body.appendChild(item);
      }
      det.appendChild(body);
      wrap.appendChild(det);
    }
  }

  function filterCommands(q) {
    q = q.trim().toLowerCase();
    document.querySelectorAll("#cmdList .group-card").forEach((det) => {
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
    initImage();

    try {
      const data = await apiJSON("/api/init");
      if (!data.ok) throw new Error("not_ok");
      state.user = data.user;
      state.status = data.status;
      state.groups = data.groups;
      renderDashboard(data);
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
