const DEFAULT_TIMEOUT = 10000;

function withTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function getJSON(url, options = {}, timeout) {
  const res = await withTimeout(url, options, timeout);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

export async function getText(url, options = {}, timeout) {
  const res = await withTimeout(url, options, timeout);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

export async function postJSON(url, options = {}, timeout) {
  const res = await withTimeout(url, { method: "POST", ...options }, timeout);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
