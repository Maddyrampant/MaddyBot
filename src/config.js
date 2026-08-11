import "dotenv/config";

const config = {
  botToken: process.env.BOT_TOKEN,
  geminiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  ownerId: Number(process.env.OWNER_ID || 0),
};

export function validate() {
  const missing = [];
  if (!config.botToken) missing.push("BOT_TOKEN");
  if (!config.geminiKey) missing.push("GEMINI_API_KEY");
  if (missing.length) {
    console.error("Missing required environment variables: " + missing.join(", "));
    console.error("Copy .env.example to .env and fill in the values.");
    return false;
  }
  return true;
}

export default config;
