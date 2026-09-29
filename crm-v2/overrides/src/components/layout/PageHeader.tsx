import type { ReactNode } from "react";

/** Единая шапка страницы: заголовок, короткое пояснение и действия справа. */
export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-[13px] leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
