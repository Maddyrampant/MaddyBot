import config from "./config.js";

const base = () => config.ollamaUrl;

function messages(prompt, history = [], system = "") {
  const out = [];
  if (system) out.push({ role: "system", content: String(system) });
  for (const m of history || []) {
    const role = m && m.role === "assistant" ? "assistant" : "user";
    out.push({ role, content: String(m.text ?? "") });
  }
  out.push({ role: "user", content: String(prompt) });
  return out;
}

async function withTimeout(p, ms) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error("OLLAMA_TIMEOUT")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function isOllamaUp() {
  try {
    const res = await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ollamaModels() {
  try {
    const res = await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));
  } catch {
    return [];
  }
}

export async function ollamaStatus() {
  const up = await isOllamaUp();
  return {
    up,
    model: config.ollamaModel,
    models: up ? await ollamaModels() : [],
  };
}

export async function completeOllama(prompt, history = [], system = "") {
  const res = await withTimeout(
    fetch(`${base()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages: messages(prompt, history, system),
        stream: false,
        options: { num_ctx: 8192 },
      }),
    }),
    180000
  );
  if (!res.ok) throw new Error(`OLLAMA_HTTP_${res.status}`);
  const data = await res.json();
  const text = ((data.message && data.message.content) || "").trim();
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
}

export async function* chatOllamaStream(prompt, history = [], system = "") {
  const res = await withTimeout(
    fetch(`${base()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages: messages(prompt, history, system),
        stream: true,
        options: { num_ctx: 8192 },
      }),
    }),
    180000
  );
  if (!res.ok) throw new Error(`OLLAMA_HTTP_${res.status}`);
  if (!res.body) throw new Error("OLLAMA_NO_STREAM");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const chunk = JSON.parse(line);
          const t = chunk.message && chunk.message.content;
          if (t) yield t;
          if (chunk.done) return;
        } catch {
          /* ignore malformed line */
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}
