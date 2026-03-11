import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root (parent of scripts/ directory)
// MUST be called before any imports that depend on env vars
config({ path: resolve(__dirname, "../.env") });

async function main() {
  // Dynamic import to ensure dotenv loads first (static imports are hoisted)
  const { default: bot } = await import("../lib/bot");

  console.log("🤖 Bot starting in long-polling mode...");
  bot.start({
    onStart: () => console.log("✅ Bot is running!"),
  });
}

main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
