// lib/bot.ts
import { config } from "dotenv";
config({ path: "/var/www/manager/.env" });
import { Bot } from "grammy";
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("[bot] TELEGRAM_BOT_TOKEN is not set");
}
// FIX (Bug 6): guard APP_URL — missing env var would silently send
// web_app: { url: undefined } which Telegram API rejects
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
if (!APP_URL) {
  throw new Error("[bot] NEXT_PUBLIC_APP_URL is not set");
}
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
bot.command("start", async (ctx) => {
  // FIX (Bug 7): removed protect_content from /start — forwarding the
  // welcome message is free viral distribution for your Mini App
  await ctx.replyWithPhoto("https://i.ibb.co/VKDpWf0/meow.png", {
    caption:
      "👋 *Welcome to MeowSMS!*\n\n" +
      "🔐 Get instant virtual phone numbers for OTP verification\n" +
      "⚡ Receive SMS from 500+ services\n\n" +
      "📩 Need help? Contact @meowsmshelp\n\n" +
      "Tap *Open App* below to get started 👇",
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🚀 Open Website",
            web_app: { url: APP_URL },
          },
        ],
      ],
    },
  });
});
bot.command("help", async (ctx) => {
  await ctx.reply(
    "🐱 *MeowSMS Help*\n\n" +
      "• /start — Open the app\n" +
      "• /help — Show this message\n\n" +
      "Need support? Contact us at @meowsmshelp or open the app and tap Support.",
    {
      parse_mode: "Markdown",
      protect_content: true, // kept on /help — less viral value
    },
  );
});
export default bot;
