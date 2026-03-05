// lib/bot.ts
import { Bot } from "grammy";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

bot.command("start", async (ctx) => {
  await ctx.replyWithPhoto(`${APP_URL}/meow.png`, {
    caption:
      "👋 *Welcome to MeowSMS!*\n\n" +
      "🔐 Get instant virtual phone numbers for OTP verification\n" +
      "⚡ Receive SMS from 500+ services\n" +
      "💰 Pay only when you receive SMS\n\n" +
      "Tap *Open App* below to get started 👇",
    parse_mode: "Markdown",
    protect_content: true, // ← hides URL on long press, disables forwarding
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🚀 Open MeowSMS",
            web_app: { url: APP_URL },
          },
        ],
      ],
    },
  });
});

// Handle /help
bot.command("help", async (ctx) => {
  await ctx.reply(
    "🐱 *MeowSMS Help*\n\n" +
      "• /start — Open the app\n" +
      "• /help — Show this message\n\n" +
      "Need support? Open the app and tap Support.",
    {
      parse_mode: "Markdown",
      protect_content: true,
    },
  );
});

export default bot;