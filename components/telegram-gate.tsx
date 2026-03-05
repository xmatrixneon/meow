"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME!;

function isTelegram(): boolean {
  if (typeof window === "undefined") return true; // SSR — don't block
  return !!(
    window.Telegram?.WebApp?.initData ||
    navigator.userAgent.includes("Telegram")
  );
}

export function TelegramGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [isInTelegram, setIsInTelegram] = useState(true);

  useEffect(() => {
    setIsInTelegram(isTelegram());
    setChecked(true);
  }, []);

  if (!checked) return null; // prevent flash

  if (!isInTelegram) return <OpenInTelegramPage />;

  return <>{children}</>;
}

function OpenInTelegramPage() {
  const telegramUrl = `https://t.me/${BOT_USERNAME}`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6 overflow-hidden relative">

      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] rounded-full bg-blue-500/5 blur-[80px]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative z-10 max-w-sm w-full flex flex-col items-center text-center gap-8">

        {/* Logo */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
          className="relative"
        >
          <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-2xl shadow-primary/20 border border-white/10">
            <img
              src="https://i.ibb.co/VKDpWf0/meow.png"
              alt="MeowSMS"
              className="w-full h-full object-cover"
            />
          </div>
          {/* Glow ring */}
          <div className="absolute inset-0 rounded-3xl ring-1 ring-white/20 ring-offset-2 ring-offset-transparent" />
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-3"
        >
          <h1 className="text-3xl font-bold text-white tracking-tight">
            MeowSMS
          </h1>
          <p className="text-white/40 text-sm leading-relaxed max-w-[260px] mx-auto">
            This app is only available inside Telegram. Open it through our bot to get started.
          </p>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="w-full grid grid-cols-3 gap-3"
        >
          {[
            { emoji: "🔐", label: "Virtual Numbers" },
            { emoji: "⚡", label: "Instant SMS" },
            { emoji: "💰", label: "Pay Per Use" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex flex-col items-center gap-2 px-2 py-3 rounded-2xl bg-white/5 border border-white/8"
            >
              <span className="text-xl">{f.emoji}</span>
              <span className="text-[10px] text-white/50 font-medium leading-tight text-center">
                {f.label}
              </span>
            </div>
          ))}
        </motion.div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="w-full"
        >
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm overflow-hidden transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/25"
          >
            {/* Shine effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            {/* Telegram icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.31 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.838.942z" />
            </svg>
            Open in Telegram
          </a>

          <p className="mt-3 text-[11px] text-white/20">
            Tap the button to open @{BOT_USERNAME}
          </p>
        </motion.div>

      </div>
    </div>
  );
}