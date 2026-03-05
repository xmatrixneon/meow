// hooks/use-sound-enabled.ts
import { useState, useEffect, useCallback } from "react";

const KEY = "sms-sound-enabled";

export function useSoundEnabled() {
  const [enabled, setEnabled] = useState<boolean>(true);

  // Read from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored !== null) {
        setEnabled(stored === "true");
      }
    } catch {
      // localStorage unavailable (e.g. SSR)
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  return { enabled, toggle };
}