import { Send } from "lucide-react";
import { telegramPhoneHref } from "@/lib/telegram-phone-link";

export function TelegramPhoneLink({ phone }: { phone: string | null }) {
  const href = telegramPhoneHref(phone);
  if (!href) return null;

  // Plain anchor: no prefetch, automatic lookup, CRM write, or sent status.
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Откроет чат, если настройки Telegram клиента разрешают поиск по номеру. Наличие аккаунта не проверяется."
    >
      <Send className="h-3.5 w-3.5" aria-hidden="true" />
      Открыть Telegram
    </a>
  );
}
