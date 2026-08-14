import { chromium } from "playwright";

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export async function closeTextRenderer() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {}
    browserPromise = null;
  }
}

/**
 * Render Persian (or any RTL) text to a transparent-ish PNG with proper
 * letter shaping, using Chromium's HarfBuzz text engine. Returns a PNG buffer
 * sized to the text, ready to overlay with ffmpeg.
 */
export async function renderTextPng(text, { fontSize = 64, color = "#ffffff" } = {}) {
  const t = String(text || "").trim();
  if (!t) throw new Error("EMPTY_TEXT");

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
  try {
    const html = `<!doctype html><html lang="fa"><head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:transparent;overflow:hidden">
        <canvas id="c"></canvas>
        <script>
          const t = ${JSON.stringify(t)};
          const fs = ${Math.floor(fontSize)};
          const c = document.getElementById('c');
          const ctx = c.getContext('2d');
          const font = 'bold ' + fs + 'px "Segoe UI", Tahoma, Arial, sans-serif';
          ctx.font = font;
          const m = ctx.measureText(t);
          const pad = Math.max(24, Math.round(fs * 0.5));
          const w = Math.ceil(m.width) + pad * 2;
          const h = Math.ceil(fs * 1.9);
          c.width = w;
          c.height = h;
          ctx.font = font;
          ctx.textBaseline = 'middle';
          ctx.direction = 'rtl';
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          const r = Math.round(h / 2);
          ctx.beginPath();
          ctx.roundRect(2, 2, w - 4, h - 4, r);
          ctx.fill();
          ctx.fillStyle = ${JSON.stringify(color)};
          ctx.fillText(t, pad, h / 2);
        </script>
      </body></html>`;
    await page.setContent(html);
    const el = await page.$("#c");
    if (!el) throw new Error("CANVAS_MISSING");
    const shot = await el.screenshot();
    return shot;
  } finally {
    await page.close();
  }
}
