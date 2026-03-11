import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root (parent of scripts/ directory)
config({ path: resolve(__dirname, "../.env") });

import bot from "../lib/bot";

console.log("🤖 Bot starting in long-polling mode...");
bot.start({
  onStart: () => console.log("✅ Bot is running!"),
});
