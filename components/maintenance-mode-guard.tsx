"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { Wrench, RefreshCw } from "lucide-react";

const LOGO = "https://i.ibb.co/kgBcLZsX/meow.png";

interface MaintenanceModeGuardProps {
  children: ReactNode;
}

export function MaintenanceModeGuard({ children }: MaintenanceModeGuardProps) {
  const { data: settings, isLoading, refetch, isError } = trpc.service.settings.useQuery(
    undefined,
    {
      staleTime: 30 * 1000, // 30 seconds
      refetchOnWindowFocus: true,
    }
  );

  // Show loading while fetching settings
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If there's an error fetching settings, let the app continue
  // (don't block the entire app if the settings check fails)
  if (isError || !settings) {
    return <>{children}</>;
  }

  // Show maintenance screen if maintenance mode is enabled
  if (settings.maintenanceMode) {
    return <MaintenanceScreen onRetry={() => refetch()} />;
  }

  // Normal operation - show the app
  return <>{children}</>;
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function LoadingScreen() {
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
          width: 100,
          height: 100,
          objectFit: "contain",
          filter:
            "drop-shadow(0 12px 28px rgba(255,107,0,0.30)) drop-shadow(0 4px 10px rgba(0,0,0,0.10))",
          zIndex: 1,
          userSelect: "none",
        }}
      />
    </div>
  );
}

// ─── Maintenance Screen ───────────────────────────────────────────────────────

interface MaintenanceScreenProps {
  onRetry: () => void;
}

function MaintenanceScreen({ onRetry }: MaintenanceScreenProps) {
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
          y: [0, -10, -14, -8, 0],
        }}
        transition={{
          opacity: { duration: 0.4, ease: "easeOut" },
          scale: { duration: 0.4, ease: "easeOut" },
          y: {
            duration: 2.5,
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

      {/* Maintenance Icon */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
        style={{
          marginTop: 28,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(255,107,0,0.15), rgba(30,120,255,0.1))",
          border: "1px solid rgba(255,107,0,0.2)",
        }}
      >
        <motion.div
          animate={{ rotate: [0, 15, -15, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Wrench
            size={36}
            style={{
              color: "rgb(var(--foreground) / 0.8)",
            }}
          />
        </motion.div>
      </motion.div>

      {/* Message */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        style={{
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          zIndex: 1,
          textAlign: "center",
          maxWidth: 300,
          padding: "0 20px",
        }}
      >
        <h1
          className="text-foreground"
          style={{ fontSize: 22, fontWeight: 700 }}
        >
          Under Maintenance
        </h1>
        <p
          className="text-muted-foreground"
          style={{ fontSize: 14, lineHeight: 1.6 }}
        >
          We&apos;re performing scheduled maintenance to improve your experience.
          Please check back soon.
        </p>
      </motion.div>

      {/* Retry Button */}
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4, ease: "easeOut" }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onRetry}
        style={{
          marginTop: 28,
          zIndex: 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 24px",
          background: "linear-gradient(135deg, #ff6b00, #ff9a3c)",
          color: "#fff",
          borderRadius: 12,
          fontWeight: 600,
          fontSize: 14,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(255, 107, 0, 0.35)",
        }}
      >
        <RefreshCw size={16} />
        Check Again
      </motion.button>
    </div>
  );
}
