"use client";

import { useEffect, useRef } from "react";

/** Горизонтальная прокрутка шкалы: при открытии сдвигает так, чтобы «сегодня» было видно (чуть левее центра). */
export function ScrollToToday({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = ref.current;
    const mark = box?.querySelector<HTMLElement>("[data-today]");
    if (!box || !mark) return;
    const sticky = 200;
    const x = mark.offsetLeft - sticky - (box.clientWidth - sticky) * 0.35;
    box.scrollLeft = Math.max(0, x);
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
