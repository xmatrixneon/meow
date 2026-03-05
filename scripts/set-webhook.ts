// scripts/set-webhook.ts
// Run once after deployment: npx tsx scripts/set-webhook.ts
// scripts/set-webhook.ts
import { config } from "dotenv";
config(); // ← load .env first

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const WEBHOOK_URL = `${APP_URL}/api/bot`;

async function setWebhook() {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        allowed_updates: ["message", "callback_query"],
      }),
    }
  );
  const data = await res.json();
  console.log("Webhook set:", data);
}

setWebhook();
