"use client";

import { useCallback, useEffect, useState } from "react";

export interface UnreadMessagesSummary {
  all: number;
  telegram: number;
  email: number;
  service: number;
}

const EMPTY: UnreadMessagesSummary = {
  all: 0,
  telegram: 0,
  email: 0,
  service: 0,
};

export const UNREAD_MESSAGES_EVENT = "satori:unread-messages-changed";

export function emitUnreadMessagesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNREAD_MESSAGES_EVENT));
  }
}

export function useUnreadMessages(pollMs = 20_000) {
  const [summary, setSummary] = useState<UnreadMessagesSummary>(EMPTY);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/messages/unread", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setSummary({
        all: Math.max(0, Number(payload.all || 0)),
        telegram: Math.max(0, Number(payload.telegram || 0)),
        email: Math.max(0, Number(payload.email || 0)),
        service: Math.max(0, Number(payload.service || 0)),
      });
    } catch {
      // Navigation badges are supplementary; never break the app because of them.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), pollMs);
    const onChanged = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(UNREAD_MESSAGES_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(UNREAD_MESSAGES_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollMs, refresh]);

  return { summary, refresh };
}
