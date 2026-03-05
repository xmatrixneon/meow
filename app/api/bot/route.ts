// app/api/bot/route.ts
import { NextRequest, NextResponse } from "next/server";
import bot from "@/lib/bot";
import { webhookCallback } from "grammy";

const handler = webhookCallback(bot, "std/http");

export async function POST(req: NextRequest) {
  try {
    return await handler(req);
  } catch (err) {
    console.error("[bot webhook] error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}