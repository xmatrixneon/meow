"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, RotateCcw, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

const isChunkLoadError = (error: Error): boolean => {
  const message = error.message?.toLowerCase() || "";
  return (
    message.includes("loading chunk") ||
    message.includes("failed to load chunk") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("import()")
  );
};

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [isChunkError, setIsChunkError] = useState(false);

  useEffect(() => {
    if (isChunkLoadError(error)) {
      // Check if we've already tried reloading
      const hasReloaded = sessionStorage.getItem("chunk-error-reload");

      if (!hasReloaded) {
        // Mark that we've attempted a reload and refresh
        sessionStorage.setItem("chunk-error-reload", "true");
        window.location.reload();
      } else {
        // Clear the flag and show the error UI
        sessionStorage.removeItem("chunk-error-reload");
        setIsChunkError(true);
      }
    }
  }, [error]);

  const handleReset = () => {
    reset();
    router.push("/");
  };

  const handleHardRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="w-full max-w-sm bg-card border border-border rounded-3xl p-8 text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
          {isChunkError ? (
            <RefreshCw size={28} className="text-primary" />
          ) : (
            <Zap size={28} className="text-destructive" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-3">
          {isChunkError ? "Update Available" : "Oops, something went wrong"}
        </h1>

        <p className="text-sm text-muted-foreground mb-6">
          {isChunkError
            ? "A new version of the app is available. Please refresh to continue."
            : error.message || "An unexpected error occurred"}
        </p>

        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={isChunkError ? handleHardRefresh : handleReset}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors duration-200"
        >
          {isChunkError ? (
            <>
              <RefreshCw size={16} />
              <span>Refresh</span>
            </>
          ) : (
            <>
              <RotateCcw size={16} />
              <span>Try Again</span>
            </>
          )}
        </motion.button>
      </motion.div>
    </div>
  );
}