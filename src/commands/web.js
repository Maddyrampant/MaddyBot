import { getJSON, getText } from "../http.js";
import { reg, argText } from "../utils.js";
import QRCode from "qrcode";
import { InputFile } from "grammy";
import { promises as dns } from "dns";

const WCODE = {
  0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Light showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorm",
  96: "Thunderstorm with hail", 99: "Severe thunderstorm",
};

export default function register(bot) {
  reg("weather", { usage: "<city>", desc: "Current weather for a city", group: "web" });
  reg("currency", { usage: "<amount> <from> <to>", desc: "Exchange rate (ECB rates)", group: "web" });
  reg("shorten", { usage: "<url>", desc: "Shorten a URL", group: "web" });
  reg("qr", { usage: "<text>", desc: "Generate a QR code image", group: "web" });
  reg("http", { usage: "<url>", desc: "Check a website's HTTP status", group: "web" });
  reg("ip", { desc: "Your public IP address", group: "web" });
  reg("ipinfo", { usage: "[ip]", desc: "Look up IP address details", group: "web" });
  reg("whois", { usage: "<domain>", desc: "WHOIS info for a domain", group: "web" });
  reg("dns", { usage: "<host>", desc: "DNS records for a host", group: "web" });
  reg("geo", { usage: "<query>", desc: "Geocode a location", group: "web" });

  bot.command("weather", async (ctx) => {
    const city = argText(ctx);
    if (!city) return ctx.reply("Usage: /weather <city>");
    await ctx.replyWithChatAction("typing");
    try {
      const geo = await getJSON(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
      );
      const place = geo.results && geo.results[0];
      if (!place) return ctx.reply("City not found.");
      const wx = await getJSON(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
      );
      const c = wx.current;
      const label = WCODE[c.weather_code] || "Unknown";
      return ctx.reply(
        `Weather in <b>${place.name}${place.country ? ", " + place.country : ""}</b>:\n` +
          `${label}\n` +
          `Temperature: <b>${c.temperature_2m}°C</b>\n` +
          `Humidity: ${c.relative_humidity_2m}%\n` +
          `Wind: ${c.wind_speed_10m} km/h`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error("weather error:", err);
      return ctx.reply("Could not fetch the weather. Check the city name and try again.");
    }
  });

  bot.command("currency", async (ctx) => {
    const parts = argText(ctx).trim().split(/\s+/);
    if (parts.length !== 3) return ctx.reply("Usage: /currency 100 usd eur");
    const amount = parseFloat(parts[0]);
    const from = parts[1].toUpperCase();
    const to = parts[2].toUpperCase();
    if (isNaN(amount)) return ctx.reply("Invalid amount.");
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON(`https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`);
      if (data.rates && data.rates[to]) {
        return ctx.reply(`${amount} ${from} = <b>${data.rates[to]}</b> ${to}`, { parse_mode: "HTML" });
      }
      return ctx.reply("Unsupported currency code. Try usd, eur, gbp, jpy, chf, ...");
    } catch (err) {
      return ctx.reply("Could not fetch exchange rate.");
    }
  });

  bot.command("shorten", async (ctx) => {
    const url = argText(ctx);
    if (!/^https?:\/\//i.test(url)) return ctx.reply("Usage: /shorten https://example.com/page");
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
      return ctx.reply(data.shorturl || "Failed to shorten.");
    } catch {
      return ctx.reply("Could not shorten that URL.");
    }
  });

  bot.command("qr", async (ctx) => {
    const text = argText(ctx);
    if (!text) return ctx.reply("Usage: /qr <text or URL>");
    if (text.length > 2000) return ctx.reply("Too long for a QR code.");
    await ctx.replyWithChatAction("typing");
    try {
      const buffer = await QRCode.toBuffer(text, { width: 600, margin: 1 });
      return ctx.replyWithPhoto(new InputFile(buffer));
    } catch {
      return ctx.reply("Could not generate the QR code.");
    }
  });

  bot.command("http", async (ctx) => {
    let url = argText(ctx);
    if (!url) return ctx.reply("Usage: /http example.com");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    await ctx.replyWithChatAction("typing");
    const start = Date.now();
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      const ms = Date.now() - start;
      return ctx.reply(`<b>${res.status}</b> ${res.statusText || ""}\nTime: ${ms}ms\nFinal URL: ${res.url}`, {
        parse_mode: "HTML",
      });
    } catch {
      return ctx.reply(`Could not reach ${url}`);
    }
  });

  bot.command("ip", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    try {
      const ip = await getText("https://api.ipify.org");
      return ctx.reply(`Your public IP: <code>${ip}</code>`, { parse_mode: "HTML" });
    } catch {
      return ctx.reply("Could not detect your IP.");
    }
  });

  bot.command("ipinfo", async (ctx) => {
    const ip = argText(ctx);
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON(`http://ip-api.com/json/${ip}?fields=status,query,country,city,regionName,isp,org,lat,lon,timezone`);
      if (data.status !== "success") return ctx.reply("Invalid IP address.");
      return ctx.reply(
        `IP: <code>${data.query}</code>\n` +
          `Location: ${data.city}, ${data.regionName}, ${data.country}\n` +
          `ISP: ${data.isp || "-"}\n` +
          `Org: ${data.org || "-"}\n` +
          `Coordinates: ${data.lat}, ${data.lon}\n` +
          `Timezone: ${data.timezone}`,
        { parse_mode: "HTML" }
      );
    } catch {
      return ctx.reply("Could not look up that IP.");
    }
  });

  bot.command("whois", async (ctx) => {
    const domain = argText(ctx).toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return ctx.reply("Usage: /whois example.com");
    await ctx.replyWithChatAction("typing");
    try {
      const data = await getJSON(`https://rdap.org/domain/${domain}`);
      const events = (data.events || []).map((e) => `${e.eventAction}: ${e.eventDate}`).join("\n");
      const entities = (data.entities || []).map((e) => e.vcardArray?.[1]?.[0]?.[1] || e.handle).filter(Boolean);
      return ctx.reply(
        `Domain: <b>${data.ldhName || domain}</b>\n` +
          `${events || "No events"}\n` +
          `Registrar/entities: ${entities.join(", ") || "-"}`,
        { parse_mode: "HTML" }
      );
    } catch {
      return ctx.reply("WHOIS lookup failed or the domain does not exist.");
    }
  });

  bot.command("dns", async (ctx) => {
    const host = argText(ctx).toLowerCase();
    if (!host) return ctx.reply("Usage: /dns example.com");
    await ctx.replyWithChatAction("typing");
    try {
      const [a, mx, ns, txt] = await Promise.all([
        dns.resolve4(host).catch(() => []),
        dns.resolveMx(host).catch(() => []),
        dns.resolveNs(host).catch(() => []),
        dns.resolveTxt(host).catch(() => []),
      ]);
      const parts = [];
      if (a.length) parts.push(`A: ${a.join(", ")}`);
      if (mx.length) parts.push(`MX: ${mx.sort((x, y) => x.priority - y.priority).map((m) => `${m.exchange}(${m.priority})`).join(", ")}`);
      if (ns.length) parts.push(`NS: ${ns.join(", ")}`);
      if (txt.length) parts.push(`TXT: ${txt.map((t) => t.join("")).join("; ")}`);
      return ctx.reply(`DNS records for <b>${host}</b>:\n${parts.join("\n") || "No records found."}`, {
        parse_mode: "HTML",
      });
    } catch {
      return ctx.reply("DNS lookup failed for that host.");
    }
  });

  bot.command("geo", async (ctx) => {
    const q = argText(ctx);
    if (!q) return ctx.reply("Usage: /geo Tehran, Iran");
    await ctx.replyWithChatAction("typing");
    try {
      const results = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": "MaddyBot/1.0" },
      });
      if (!results.length) return ctx.reply("No results.");
      const lines = results.map(
        (r, i) => `${i + 1}. ${r.display_name} — ${r.lat}, ${r.lon}`
      );
      return ctx.reply(`Results:\n${lines.join("\n")}`);
    } catch {
      return ctx.reply("Geocoding failed.");
    }
  });
}
