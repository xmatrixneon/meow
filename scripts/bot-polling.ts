import { config } from "dotenv";
config({ path: "/var/www/manager/.env" });

import bot from "../lib/bot";

console.log("🤖 Bot starting in long-polling mode...");
bot.start({
  onStart: () => console.log("✅ Bot is running!"),
});
