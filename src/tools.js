import config from "./config.js";
import { parse as parseHTML } from "node-html-parser";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, readdir } from "fs/promises";
import { remember } from "./memory.js";

const execAsync = promisify(exec);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export const registry = new Map();

export function makeTool({ name, description, parameters, needsApproval = false, allowedFor = null, handler }) {
  return { name, description, parameters, needsApproval, allowedFor, handler };
}

export function registerTool(tool) {
  registry.set(tool.name, tool);
  return tool;
}

export function getTool(name) {
  return registry.get(name);
}

function isOwner(userId) {
  return Boolean(config.ownerId && userId === config.ownerId);
}

async function fetchText(url, maxLen = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeout);
  try {
    const res = await fetch(String(url), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, "accept-language": "en,fa;q=0.8" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer()).slice(0, 1_500_000);
    const text = buf.toString("utf8");
    const ct = res.headers.get("content-type") || "";
    if (/html/i.test(ct) || /<html|<!doctype/i.test(text.slice(0, 500))) {
      const root = parseHTML(text);
      const body = root.querySelector("body") || root;
      return body.textContent.replace(/\s+/g, " ").trim().slice(0, maxLen);
    }
    return text.slice(0, maxLen);
  } finally {
    clearTimeout(t);
  }
}

registerTool(
  makeTool({
    name: "web_fetch",
    description:
      "Fetch a URL and return its readable text content (HTML stripped). Use this to read web pages, articles and docs.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Full URL (must start with http:// or https://)" } },
      required: ["url"],
    },
    async handler(args) {
      const url = String(args.url || "");
      if (!/^https?:\/\//i.test(url)) throw new Error("invalid url");
      return await fetchText(url);
    },
  })
);

registerTool(
  makeTool({
    name: "web_search",
    description:
      "Search the web via DuckDuckGo. Returns a JSON list of results with title, url and snippet. Use this to find information, sources and current data.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        count: { type: "number", description: "Number of results (default 5)" },
      },
      required: ["query"],
    },
    async handler(args) {
      const q = encodeURIComponent(String(args.query || ""));
      const count = Math.min(10, Math.max(1, Number(args.count || 5)));
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), config.fetchTimeout);
      try {
        const res = await fetch("https://html.duckduckgo.com/html/?q=" + q, {
          signal: ctrl.signal,
          headers: { "user-agent": UA },
        });
        const html = await res.text();
        const root = parseHTML(html);
        const results = [];
        for (const el of root.querySelectorAll(".result").slice(0, count)) {
          const a = el.querySelector(".result__a");
          const sn = el.querySelector(".result__snippet");
          if (!a) continue;
          results.push({
            title: a.textContent.trim(),
            url: (a.getAttribute("href") || "").replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, ""),
            snippet: sn ? sn.textContent.trim() : "",
          });
        }
        if (!results.length) return "No results found.";
        return JSON.stringify(results);
      } finally {
        clearTimeout(t);
      }
    },
  })
);

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await import("playwright");
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

registerTool(
  makeTool({
    name: "browse",
    description:
      "Open a webpage in a headless browser and return its visible text. Use for pages that render with JavaScript.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to open" },
        waitMs: { type: "number", description: "ms to wait after load (default 1500)" },
      },
      required: ["url"],
    },
    async handler(args) {
      const url = String(args.url || "");
      if (!/^https?:\/\//i.test(url)) throw new Error("invalid url");
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.browserTimeout });
        const wait = Number(args.waitMs || 1500);
        if (wait > 0) await page.waitForTimeout(wait);
        const text = await page.evaluate(() => (document.body ? document.body.innerText : ""));
        return text.replace(/\s+/g, " ").trim().slice(0, 10000) || "(empty page)";
      } finally {
        await page.close().catch(() => {});
      }
    },
  })
);

registerTool(
  makeTool({
    name: "api_call",
    description:
      "Make a raw HTTP request to an API. GET and HEAD are allowed for anyone; POST/PUT/PATCH/DELETE only for the bot owner.",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] },
        url: { type: "string" },
        headers: { type: "object", description: "Optional extra headers" },
        body: { type: "string", description: "Request body (for non-GET methods)" },
      },
      required: ["method", "url"],
    },
    allowedFor: (userId) => true, // method check inside handler
    async handler(args) {
      const method = String(args.method || "GET").toUpperCase();
      const url = String(args.url || "");
      if (!/^https?:\/\//i.test(url)) throw new Error("invalid url");
      const stateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
      if (stateChanging && !isOwner(this.userId)) {
        throw new Error("this method requires the bot owner");
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), config.fetchTimeout);
      try {
        const res = await fetch(url, {
          method,
          signal: ctrl.signal,
          headers: { "user-agent": UA, ...(args.headers || {}) },
          body: ["POST", "PUT", "PATCH"].includes(method) ? String(args.body || "") : undefined,
        });
        const buf = Buffer.from(await res.arrayBuffer()).slice(0, 200_000);
        let out = buf.toString("utf8");
        if (/json/i.test(res.headers.get("content-type") || "")) {
          try {
            out = JSON.stringify(JSON.parse(out));
          } catch {}
        }
        return `HTTP ${res.status}\n${out.slice(0, 6000)}`;
      } finally {
        clearTimeout(t);
      }
    },
  })
);

registerTool(
  makeTool({
    name: "shell",
    description:
      "Run a shell command on the host machine (Windows PowerShell). Owner only. Returns stdout and stderr.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Command to run" } },
      required: ["command"],
    },
    needsApproval: true,
    async handler(args) {
      const command = String(args.command || "");
      if (!command.trim()) throw new Error("empty command");
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      return (stdout + (stderr ? "\n[stderr] " + stderr : "")).slice(0, 6000) || "(no output)";
    },
  })
);

registerTool(
  makeTool({
    name: "read_file",
    description: "Read a text file from the host computer. Owner only.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute or relative file path" } },
      required: ["path"],
    },
    needsApproval: true,
    async handler(args) {
      const content = await readFile(String(args.path || ""), "utf8");
      return content.slice(0, 6000);
    },
  })
);

registerTool(
  makeTool({
    name: "write_file",
    description: "Write content to a file on the host computer. Owner only.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string", description: "Full file content" },
      },
      required: ["path", "content"],
    },
    needsApproval: true,
    async handler(args) {
      await writeFile(String(args.path || ""), String(args.content ?? ""));
      return "file written";
    },
  })
);

registerTool(
  makeTool({
    name: "list_dir",
    description: "List the contents of a directory on the host computer. Owner only.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path" } },
      required: ["path"],
    },
    needsApproval: true,
    async handler(args) {
      const items = await readdir(String(args.path || "."));
      return items.slice(0, 500).join("\n");
    },
  })
);

registerTool(
  makeTool({
    name: "open_app",
    description: "Open an application, file or URL on the host computer (Windows). Owner only.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "App name (e.g. notepad), exe path, file, or URL to open" },
      },
      required: ["target"],
    },
    needsApproval: true,
    async handler(args) {
      const target = String(args.target || "");
      if (!target.trim()) throw new Error("empty target");
      if (/[&;|<>^*]/.test(target)) throw new Error("unsafe target");
      await execAsync(`start "" "${target}"`, { windowsHide: true });
      return "opened";
    },
  })
);

registerTool(
  makeTool({
    name: "evaluate",
    description:
      "Evaluate a math expression or a pure JavaScript expression (no I/O allowed). Owner only. Returns the result as text.",
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
    needsApproval: true,
    async handler(args) {
      const expr = String(args.expression || "");
      if (/require|process|import|exec|child_process|readFile|writeFile|fetch|eval|global/i.test(expr)) {
        throw new Error("expression contains blocked code");
      }
      const fn = new Function(`return (${expr})`);
      const v = fn();
      if (v === undefined) return "undefined";
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    },
  })
);

export function rememberToolFor(userId) {
  return makeTool({
    name: "remember",
    description:
      "Save a long-term personal memory about the user (a preference, fact, event, project). Call this when the user asks you to remember something or shares something important about themselves.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "The fact to remember" } },
      required: ["text"],
    },
    async handler(args) {
      const res = await remember(userId, String(args.text || ""), "fact", "agent");
      if (!res) return "nothing to save";
      return res.existed ? "already remembered (similar memory exists)" : "saved to long-term memory";
    },
  });
}
