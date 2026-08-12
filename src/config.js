import "dotenv/config";

const config = {
  botToken: process.env.BOT_TOKEN,
  geminiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
  ownerId: Number(process.env.OWNER_ID || 0),
  agentEnabled: process.env.AGENT_ENABLED !== "false",
  agentTimeout: Number(process.env.AGENT_TIMEOUT || 120000),
  browserTimeout: Number(process.env.BROWSER_TIMEOUT || 30000),
  fetchTimeout: Number(process.env.FETCH_TIMEOUT || 15000),
  maxAgentRounds: Number(process.env.MAX_AGENT_ROUNDS || 5),
  webappEnabled: process.env.WEBAPP_ENABLED !== "false",
  webappHost: process.env.WEBAPP_HOST || "127.0.0.1",
  webappPort: Number(process.env.WEBAPP_PORT || 8834),
  webappUrl:
    process.env.WEBAPP_URL ||
    `http://localhost:${Number(process.env.WEBAPP_PORT || 8834)}`,
  webappAllowInsecure: process.env.WEBAPP_ALLOW_INSECURE === "true",
};

export function validate() {
  const missing = [];
  if (!config.botToken) missing.push("BOT_TOKEN");
  if (missing.length) {
    console.error("Missing required environment variables: " + missing.join(", "));
    console.error("Copy .env.example to .env and fill in the values.");
    return false;
  }
  if (!config.geminiKey) {
    console.warn("GEMINI_API_KEY is not set. Chat and AI commands will show a setup hint until you add it.");
  }
  if (!config.ownerId) {
    console.warn("OWNER_ID is not set. System tools (shell, files, apps) are disabled until you add your Telegram ID.");
  }
  return true;
}

export default config;
