"use client";
// components/telegram-gate.tsx

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useTelegramAuth } from "@/hooks/use-telegram-auth";
import { Progress } from "@/components/ui/progress";

const LOGO = "https://i.ibb.co/kgBcLZsX/meow.png";

interface TelegramGateProps {
  children: ReactNode;
}

export function TelegramGate({ children }: TelegramGateProps) {
  const { status, error, retry, progress, progressLabel } = useTelegramAuth();

  switch (status) {
    case "loading":
      return <LoadingScreen progress={progress} label={progressLabel} />;
    case "unauthenticated":
      return <OpenInTelegramScreen />;
    case "error":
      return <ErrorScreen message={error?.message} onRetry={retry} />;
    case "authenticated":
      return <>{children}</>;
    default:
      return <LoadingScreen progress={progress} label={progressLabel} />;
  }
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function LoadingScreen({
  progress,
  label,
}: {
  progress: number;
  label: string;
}) {
  return (
    <div
      className="bg-background"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Ambient glow */}
      <motion.div
        animate={{ scale: [0.94, 1.06, 0.94], opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,107,0,0.14) 0%, rgba(30,120,255,0.08) 45%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <motion.img
        src={LOGO}
        alt="MeowSMS"
        draggable={false}
        animate={{
          y: [0, -18, -22, -12, 0],
          scale: [1, 1.05, 1.07, 1.03, 1],
        }}
        transition={{
          duration: 1.9,
          repeat: Infinity,
          ease: [0.36, 0.07, 0.19, 0.97],
          times: [0, 0.3, 0.5, 0.7, 1],
        }}
        style={{
          width: 120,
          height: 120,
          objectFit: "contain",
          filter:
            "drop-shadow(0 12px 28px rgba(255,107,0,0.30)) drop-shadow(0 4px 10px rgba(0,0,0,0.10))",
          zIndex: 1,
          userSelect: "none",
        }}
      />

      {/* Brand wordmark */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "baseline",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: -0.5,
            background: "linear-gradient(135deg, #ff6b00, #ff9a3c)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Meow
        </span>
        <span
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: -0.5,
            background: "linear-gradient(135deg, #1e78ff, #5ba4ff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          SMS
        </span>
      </motion.div>

      {/* Progress bar + label */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        style={{
          marginTop: 28,
          width: 220,
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Progress
          value={progress}
          className="h-1.5 w-full bg-muted"
          style={
            {
              "--progress-color":
                progress < 70 ? "#ff6b00" : "#1e78ff",
            } as React.CSSProperties
          }
        />
        <motion.p
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="text-muted-foreground"
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </motion.p>
      </motion.div>
    </div>
  );
}

// ─── Open in Telegram ─────────────────────────────────────────────────────────

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || "meowsmsxbot";

function OpenInTelegramScreen() {
  const telegramUrl = `https://t.me/${BOT_USERNAME}`;

  return (
    <div
      className="bg-background"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Ambient glow */}
      <motion.div
        animate={{ scale: [0.94, 1.06, 0.94], opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,107,0,0.14) 0%, rgba(30,120,255,0.08) 45%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <motion.img
        src={LOGO}
        alt="MeowSMS"
        draggable={false}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: [0, -18, -22, -12, 0],
        }}
        transition={{
          opacity: { duration: 0.4, ease: "easeOut" },
          scale: { duration: 0.4, ease: "easeOut" },
          y: {
            duration: 1.9,
            repeat: Infinity,
            ease: [0.36, 0.07, 0.19, 0.97],
            times: [0, 0.3, 0.5, 0.7, 1],
            delay: 0.4,
          },
        }}
        style={{
          width: 120,
          height: 120,
          objectFit: "contain",
          filter:
            "drop-shadow(0 12px 28px rgba(255,107,0,0.30)) drop-shadow(0 4px 10px rgba(0,0,0,0.10))",
          zIndex: 1,
          userSelect: "none",
        }}
      />

      {/* Brand wordmark */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "baseline",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: -0.5,
            background: "linear-gradient(135deg, #ff6b00, #ff9a3c)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Meow
        </span>
        <span
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: -0.5,
            background: "linear-gradient(135deg, #1e78ff, #5ba4ff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          SMS
        </span>
      </motion.div>

      {/* Message */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        style={{
          marginTop: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          zIndex: 1,
          textAlign: "center",
          maxWidth: 280,
        }}
      >
        <h1
          className="text-foreground"
          style={{ fontSize: 20, fontWeight: 600 }}
        >
          Open in Telegram
        </h1>
        <p className="text-muted-foreground" style={{ fontSize: 14, lineHeight: 1.5 }}>
          MeowSMS is a Telegram Mini App. Please open it through Telegram.
        </p>
      </motion.div>

      {/* Open in Telegram Button */}
      <motion.a
        href={telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        style={{
          marginTop: 24,
          zIndex: 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 28px",
          background: "linear-gradient(135deg, #0088cc, #00a6ed)",
          color: "#fff",
          borderRadius: 14,
          fontWeight: 600,
          fontSize: 15,
          textDecoration: "none",
          boxShadow: "0 4px 16px rgba(0, 136, 204, 0.35)",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ flexShrink: 0 }}
        >
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
        Open in Telegram
      </motion.a>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────

function ErrorScreen({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <motion.img
        src={LOGO}
        alt="MeowSMS"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-20 h-20 object-contain opacity-50"
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="flex flex-col items-center gap-3"
      >
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {message ?? "An unexpected error occurred."}
        </p>
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ opacity: 0.88 }}
          onClick={onRetry}
          className="mt-1 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </motion.button>
      </motion.div>
    </div>
  );
}