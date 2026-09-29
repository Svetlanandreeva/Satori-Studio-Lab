"use client";
import { useEffect } from "react";

/** Регистрирует service worker, чтобы CRM можно было установить как приложение. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/app-sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
