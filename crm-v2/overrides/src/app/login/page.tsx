"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось войти");
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      window.location.replace(next && next.startsWith("/") ? next : "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось войти");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#f4f5f7] px-4 py-8 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,.10)]">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-indigo-50/70 px-7 pb-7 pt-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-[12px] font-semibold tracking-[.16em] text-white shadow-sm">S</div>
            <div>
              <div className="text-[17px] font-semibold tracking-tight text-slate-950">Satori CRM</div>
              <div className="text-[12px] text-slate-500">рабочее пространство</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <LockKeyhole className="h-[18px] w-[18px]" />
            </div>
            <div>
              <h1 className="text-[24px] font-semibold tracking-[-.025em] text-slate-950">Вход в CRM</h1>
              <p className="mt-1.5 text-[13px] leading-5 text-slate-500">Один раз введи пароль — на этом устройстве вход сохранится примерно на 6 месяцев.</p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5 px-7 py-7">
          <div>
            <label htmlFor="password" className="mb-2 block text-[12px] font-medium text-slate-600">Пароль</label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                className="h-12 rounded-2xl border-slate-200 bg-slate-50/70 pr-12 text-[16px] shadow-none focus-visible:bg-white"
                placeholder="Введите пароль"
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-xl text-slate-400 hover:text-slate-700"
                aria-label={show ? "Скрыть пароль" : "Показать пароль"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && <p className="mt-2 text-[12px] font-medium text-rose-600">{error}</p>}
          </div>

          <Button type="submit" disabled={!password || loading} className="h-12 w-full rounded-2xl bg-slate-950 text-[14px] font-medium shadow-sm hover:bg-slate-800">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            {loading ? "Входим…" : "Войти и запомнить устройство"}
          </Button>

          <div className="rounded-2xl bg-emerald-50/70 px-4 py-3 text-[11px] leading-5 text-emerald-800">
            Сессия хранится в защищённой HttpOnly-cookie. Пароль в браузере CRM не сохраняет.
          </div>
        </form>
      </div>
    </div>
  );
}
