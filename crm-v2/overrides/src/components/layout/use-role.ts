"use client";

import { useEffect, useState } from "react";

type Me = { id: string; name: string; role: "owner" | "manager" | "viewer" };
let cached: Me | null = null;
let pending: Promise<Me | null> | null = null;

/** Роль вошедшего. Пока не знаем — null (разделы владельца скрыты, чтобы не мигали у менеджера). */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cached);
  useEffect(() => {
    if (cached) return;
    pending ||= fetch("/api/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let alive = true;
    pending.then((m) => { if (m) cached = m; if (alive) setMe(m); });
    return () => { alive = false; };
  }, []);
  return me;
}
