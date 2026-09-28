import { useState, useEffect, useRef } from "react";
import { Toaster, toast } from "sonner";
import { motion } from "motion/react";
import logoImg from "@/imports/logo.webp";
import {
  ShoppingBag, Menu, X, Star, ArrowRight, Check,
  Plus, Minus, ChevronLeft, Truck, Send, Heart,
  Sparkles, Clock, Shield, Instagram, MessageCircle,
  Search, Zap, RotateCw, Layers, Palette, Package, Phone,
  Lock, LogOut, Pencil, Trash2, PackageSearch, ClipboardList, Upload, Users, Tag, Inbox, Film
} from "lucide-react";

type Page = "home" | "catalog" | "product" | "about" | "custom" | "faq" | "business" | "privacy" | "track" | "delivery" | "limited";

interface Product {
  id: number;
  name: string;
  nameEn: string;
  category: string;
  price: number;
  img: string;
  imgs?: string[];
  badge?: string;
  inStock: boolean;
  lead?: string;
  material?: string;
  dims?: string;
  weight?: string;
  description?: string;
  watt?: string;
  colors?: number;
  colorSwatches?: { color: string; img?: string }[];
  createdAt?: number;
  limitedEdition?: boolean;
  editionNumber?: number;
  editionTotal?: number;
}
interface CartItem { product: Product; qty: number }

// ── Categories — single source of truth, used by home, catalog filter and admin form ──
const CATEGORIES = ["Декор", "Лампы", "Украшения"];

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG    = "#181411";
const CARD  = "#201C18";
const LIGHT = "#F0EAE2";   // light card bg
const CREAM = "#ECE6DF";
const OG    = "#E07A34";   // orange accent

// Solid secondary-text tones — replace alpha-blended CREAM/black text, which
// measured well under WCAG AA (as low as ~1.7:1) against BG/LIGHT. Both pass
// 4.5:1+ against their surface, MUTED with comfortable margin (~8:1).
const MUTED       = "#B3A89A"; // secondary text on dark surfaces (BG/CARD)
const FAINT       = "#8F8578"; // tertiary/decorative text on dark surfaces
const MUTED_LIGHT = "#6B6255"; // secondary text on light cards (LIGHT)

const JK  = "'Plus Jakarta Sans', sans-serif";  // headings & display
const MONO = "'IBM Plex Mono', monospace";
const SERIF = "'Playfair Display', serif";  // large display headings — matches Figma concept
const LABEL = "'Inter', sans-serif";  // small-caps section labels — matches Figma concept

// ── First-order promo — single source, referenced everywhere it's mentioned in UI ──
const FIRST_ORDER_PROMO_CODE = "SATORI30";
const FIRST_ORDER_DISCOUNT_PCT = 30;
const firstOrderPrice = (price: number) => Math.round(price * (1 - FIRST_ORDER_DISCOUNT_PCT / 100));

// ── Contacts ───────────────────────────────────────────────────────────────────
const TELEGRAM_HANDLE = "she_knows_s";
const TELEGRAM_URL = `https://t.me/${TELEGRAM_HANDLE}`;
const INSTAGRAM_HANDLE = "_satori_studio_";
const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`;
const VK_URL = "https://vk.ru/satory_lab";
const VK_APP_ID = 54667082;
const FUND_LOGO_URL = "";
const EMAIL = "studiosatori@yandex.com";
const PHONE = "+7 993 519-51-41";
const PHONE_HREF = "+79935195141";
const WHATSAPP_URL = "https://wa.me/79935195141";
const BODY = "'Inter', sans-serif";

// ── Ecommerce dataLayer (Yandex Metrika, ecommerce:"dataLayer") ────────────────
function pushEcommerce(payload: Record<string, unknown>) {
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).dataLayer.push({ ecommerce: payload });
}

// ── Metrika identifiers — captured once per visit, used for server-side offline-conversion fallback ──
function captureMetrikaIdentifiers() {
  try {
    const yclid = new URLSearchParams(window.location.search).get("yclid");
    if (yclid) localStorage.setItem("satori_yclid", yclid);
  } catch {}
  try {
    (window as any).ym?.(110458266, "getClientID", (clientID: string) => {
      try { localStorage.setItem("satori_cid", clientID); } catch {}
    });
  } catch {}
}
function getMetrikaTracking() {
  try {
    return {
      yclid: localStorage.getItem("satori_yclid") || undefined,
      clientId: localStorage.getItem("satori_cid") || undefined,
    };
  } catch { return {}; }
}

// ── Доставка ───────────────────────────────────────────────────────────────────
// Ozon Доставка добавится сюда, когда будет одобрена заявка и подключён API —
// пока это просто пункт выбора, курьер согласовывается вручную по контактам заказа.
const DELIVERY_METHODS = ["СДЭК", "Почта России", "Ozon Доставка (скоро)", "Самовывоз (Екатеринбург)"];
const DELIVERY_METHODS_DISABLED = ["Ozon Доставка (скоро)"];
const CONTACT_METHODS = ["Телефон", "WhatsApp", "Telegram", "ВКонтакте"];

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);

// ── Responsive image URLs — resizes Unsplash-hosted photos so small
// (grid/cart) renders don't fetch full-size images; auto=format already
// lets Unsplash's CDN serve WebP/AVIF to browsers that support it.
function imgSrc(url: string, w: number, h?: number) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("unsplash.com")) return url;
    u.searchParams.set("w", String(w));
    if (h) u.searchParams.set("h", String(h));
    return u.toString();
  } catch {
    return url;
  }
}
function imgSrcSet(url: string, w: number, h?: number) {
  return `${imgSrc(url, w, h)} 1x, ${imgSrc(url, w * 2, h ? h * 2 : undefined)} 2x`;
}

// ── Self-hosted image pipeline — talks to the /uploads/:file?w=&fmt= route
// (server/imageResize.js). Real product photos live under /uploads/, so this
// is what actually serves AVIF/WebP with a real (non-fake) srcset in prod.
const UPLOAD_WIDTHS = [320, 480, 640, 960, 1280, 1600] as const;
function isUploadUrl(url: string) { return url.startsWith("/uploads/"); }
function uploadVariant(url: string, w: number, fmt: "avif" | "webp" | "jpeg") {
  return `${url}?w=${w}&fmt=${fmt}`;
}
function widthsAround(target: number) {
  const picked = UPLOAD_WIDTHS.filter((w) => w >= target * 0.7 && w <= target * 2.2);
  if (picked.length) return picked;
  // target falls outside every bucket (e.g. tiny 44-112px admin/cart thumbnails,
  // smaller than our smallest 320w variant) — clamp to the nearest end instead
  // of always falling back to the largest, which would massively over-serve them.
  return [target < UPLOAD_WIDTHS[0] ? UPLOAD_WIDTHS[0] : UPLOAD_WIDTHS[UPLOAD_WIDTHS.length - 1]];
}
function uploadSrcSet(url: string, target: number, fmt: "avif" | "webp" | "jpeg") {
  return widthsAround(target).map((w) => `${uploadVariant(url, w, fmt)} ${w}w`).join(", ");
}

// Renders <picture> with AVIF/WebP sources + a JPEG <img> fallback for
// self-hosted /uploads/ photos. Falls back to the old single-<img>
// imgSrc/imgSrcSet path for external URLs (Unsplash placeholder data in
// local dev). `display:contents` on <picture> keeps it invisible to layout,
// so every existing className/style on the <img> renders exactly as before.
function Picture({ src, w, h, alt, sizes, className, style, loading = "lazy", fetchPriority, decoding = "async" }: {
  src: string; w: number; h?: number; alt: string; sizes?: string;
  className?: string; style?: React.CSSProperties;
  loading?: "lazy" | "eager"; fetchPriority?: "high" | "low" | "auto"; decoding?: "async" | "sync" | "auto";
}) {
  const imgProps = {
    alt, className, style, loading, decoding,
    ...(fetchPriority ? { fetchpriority: fetchPriority } : {}),
  } as const;
  if (!isUploadUrl(src)) {
    return <img src={imgSrc(src, w, h)} srcSet={imgSrcSet(src, w, h)} sizes={sizes} {...imgProps} />;
  }
  const jpgWidths = widthsAround(w);
  const fallbackW = jpgWidths[Math.min(1, jpgWidths.length - 1)];
  return (
    <picture style={{ display: "contents" }}>
      <source type="image/avif" srcSet={uploadSrcSet(src, w, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={uploadSrcSet(src, w, "webp")} sizes={sizes} />
      <img src={uploadVariant(src, fallbackW, "jpeg")} srcSet={uploadSrcSet(src, w, "jpeg")} sizes={sizes}
        width={w} height={h} {...imgProps} />
    </picture>
  );
}

// ── Scroll-reveal — fade + rise once when a section enters the viewport ──────
// Decorative only: never blocks interaction, and prefers-reduced-motion (see
// globals.css) collapses the transition duration to ~0, so it's a straight
// no-op for anyone who's asked for less motion.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}
const revealStyle = (inView: boolean, delayMs = 0): React.CSSProperties => ({
  opacity: inView ? 1 : 0,
  transform: inView ? "translateY(0)" : "translateY(18px)",
  transition: `opacity 600ms cubic-bezier(0.23,1,0.32,1) ${delayMs}ms, transform 600ms cubic-bezier(0.23,1,0.32,1) ${delayMs}ms`,
});

// ── Logo — brand-book wordmark PNG ────────────────────────────────────────────
// Intrinsic file is 400×229 (src/imports/logo.webp) — explicit width/height
// (derived from the requested height) prevent layout shift while it loads.
const LOGO_ASPECT = 400 / 229;
function Logo({ height = 36, style }: { height?: number; style?: React.CSSProperties }) {
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <img
      src={logoImg}
      alt="SATORI"
      width={width}
      height={height}
      style={{
        height,
        width: "auto",
        display: "block",
        background: "transparent",
        ...style,
      }}
    />
  );
}

// ── NavBar ─────────────────────────────────────────────────────────────────────
function NavBar({ page, setPage, cartCount, onCartOpen }: {
  page: Page; setPage: (p: Page) => void; cartCount: number; onCartOpen: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-[background,backdrop-filter] duration-300"
      style={{ background: scrolled ? `${BG}ee` : `linear-gradient(to bottom, ${BG}80 0%, ${BG}00 100%)`, backdropFilter: scrolled ? "blur(16px)" : "none" }}>
      <div className="max-w-7xl mx-auto px-5 md:px-10 h-14 flex items-center justify-between">
        {/* Logo — hidden on home when not scrolled (like reference: just hamburger+bag) */}
        <button
          onClick={() => { if (scrolled || page !== "home") setPage("home"); else setMobileOpen(!mobileOpen); }}
          aria-label={(scrolled || page !== "home") ? "На главную" : (mobileOpen ? "Закрыть меню" : "Открыть меню")}
          className="flex items-center gap-2.5 active:scale-90 transition-transform duration-150">
          {(scrolled || page !== "home")
            ? <Logo height={36} style={{ background: "transparent" }} />
            : (mobileOpen ? <X size={22} style={{ color: MUTED }} /> : <Menu size={22} style={{ color: MUTED }} />)
          }
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7">
          {(["catalog","limited","about","custom","business","faq"] as Page[]).map((p) => {
            const labels: Record<string, string> = { catalog: "Каталог", limited: "Лимит. серия", about: "О студии", custom: "На заказ", business: "Бизнесу", faq: "FAQ" };
            return (
              <button key={p} onClick={() => setPage(p)}
                style={{ fontFamily: BODY, fontSize: 13, color: page === p ? CREAM : `${CREAM}80`, transition: "color 0.2s" }}
                onMouseEnter={(e) => { if (page !== p) (e.currentTarget as HTMLElement).style.color = CREAM; }}
                onMouseLeave={(e) => { if (page !== p) (e.currentTarget as HTMLElement).style.color = `${CREAM}80`; }}>
                {labels[p]}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <button onClick={onCartOpen} aria-label={`Корзина${cartCount ? `, ${cartCount} товар(ов)` : ""}`}
            className="relative active:scale-90 transition-transform duration-150" style={{ color: MUTED }}>
            <ShoppingBag size={19} />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: CREAM, color: "#1A1412", borderRadius: 99 }}>{cartCount}</span>
            )}
          </button>
          {(scrolled || page !== "home") && (
            <button className="md:hidden active:scale-90 transition-transform duration-150" style={{ color: MUTED }}
              aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"} onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div style={{ backgroundColor: BG, borderTop: `1px solid ${CREAM}12` }}
          className="md:hidden px-5 py-5 flex flex-col gap-5 motion-safe:animate-[fadeSlideDown_180ms_ease-out]">
          {(["catalog","limited","about","custom","business","faq"] as Page[]).map((p) => {
            const labels: Record<string, string> = { catalog: "Каталог", limited: "Лимит. серия", about: "О студии", custom: "На заказ", business: "Бизнесу", faq: "FAQ" };
            return <button key={p} onClick={() => { setPage(p); setMobileOpen(false); }}
              className="text-left text-sm" style={{ fontFamily: BODY, color: MUTED }}>{labels[p]}</button>;
          })}
        </div>
      )}
    </header>
  );
}

// ── Checkout API ──────────────────────────────────────────────────────────────
async function submitCheckout(items: CartItem[], customer: {
  name: string; phone: string; email?: string; delivery?: string; comment?: string;
  postalCode?: string; address?: string; apartment?: string;
  contactMethod?: string; contactHandle?: string;
}, promoCode?: string) {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((i) => ({ id: i.product.id, name: i.product.name, price: i.product.price, qty: i.qty })),
      customer,
      promoCode: promoCode || undefined,
      tracking: getMetrikaTracking(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Не удалось оформить заказ");
  return data as { orderId: string; confirmationUrl: string };
}

async function validatePromoCode(code: string, amount: number) {
  const res = await fetch("/api/promocodes/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, amount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Промокод не найден");
  return data as { code: string; type: string; value: number; discount: number };
}

// ── Согласие на обработку персональных данных (переиспользуется в формах) ───
function ConsentCheckbox({ checked, onChange, onOpenPolicy, onLight }: {
  checked: boolean; onChange: (v: boolean) => void; onOpenPolicy: () => void; onLight?: boolean;
}) {
  const textColor = onLight ? MUTED_LIGHT : MUTED;
  const linkColor = onLight ? "#1A1412" : OG;
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0" style={{ accentColor: onLight ? "#1A1412" : OG, width: 15, height: 15 }} />
      <span style={{ fontFamily: BODY, fontSize: 11, color: textColor, lineHeight: 1.5 }}>
        Согласен(на) с{" "}
        <button type="button" onClick={onOpenPolicy} style={{ color: linkColor, textDecoration: "underline" }}>
          политикой обработки персональных данных
        </button>
      </span>
    </label>
  );
}

// ── VK ID: кнопка «Войти через VK» — подставляет профиль в форму заказа ─────
declare global {
  interface Window { VKIDSDK?: any }
}

function VKLoginWidget({ onSuccess }: { onSuccess: (data: { vkUserId: number; profileUrl: string }) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function render() {
      if (cancelled || !containerRef.current || !window.VKIDSDK) return;
      const VKID = window.VKIDSDK;
      try {
        VKID.Config.init({
          app: VK_APP_ID,
          redirectUrl: window.location.origin + "/",
          responseMode: VKID.ConfigResponseMode.Callback,
          source: VKID.ConfigSource.LOWCODE,
          scope: "",
        });
        const oneTap = new VKID.OneTap();
        oneTap.render({ container: containerRef.current, showAlternativeLogin: true })
          .on(VKID.WidgetEvents.ERROR, (err: unknown) => console.warn("VK ID widget event:", err))
          .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, (payload: any) => {
            const { code, device_id } = payload;
            VKID.Auth.exchangeCode(code, device_id)
              .then((data: any) => {
                const userId = data?.user_id ?? data?.user?.id;
                if (userId) onSuccess({ vkUserId: userId, profileUrl: `vk.com/id${userId}` });
                else setError("Не удалось получить профиль VK");
              })
              .catch(() => setError("Не удалось войти через VK"));
          });
      } catch {
        setError("Не удалось загрузить вход через VK");
      }
    }

    if (window.VKIDSDK) {
      render();
    } else {
      const existing = document.getElementById("vkid-sdk-script") as HTMLScriptElement | null;
      if (!existing) {
        const script = document.createElement("script");
        script.id = "vkid-sdk-script";
        script.src = "https://unpkg.com/@vkid/sdk/dist-sdk/umd/index.js";
        script.onload = render;
        script.onerror = () => setError("Не удалось загрузить VK ID");
        document.head.appendChild(script);
      } else {
        existing.addEventListener("load", render);
        if (window.VKIDSDK) render();
      }
    }

    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div ref={containerRef} />
      {error && <p style={{ fontFamily: BODY, fontSize: 11, color: "#E05A5A", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

// ── Cart Drawer ────────────────────────────────────────────────────────────────
function CartDrawer({ open, onClose, items, onQtyChange, onRemove, onNavigate }: {
  open: boolean; onClose: () => void; items: CartItem[];
  onQtyChange: (id: number, d: number) => void; onRemove: (id: number) => void; onNavigate: (p: Page) => void;
}) {
  const total = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const [mode, setMode] = useState<"cart" | "checkout" | "quick">("cart");
  const [form, setForm] = useState({
    name: "", phone: "", email: "", delivery: DELIVERY_METHODS[0], comment: "",
    postalCode: "", address: "", apartment: "",
    contactMethod: CONTACT_METHODS[0], contactHandle: "",
  });
  const [quickPhone, setQuickPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [quickConsent, setQuickConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; type: string; value: number; discount: number } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const openPolicy = () => { onClose(); onNavigate("privacy"); };
  const finalTotal = total - (promo?.discount ?? 0);

  function reset() {
    setMode("cart"); setError(null); setLoading(false); setConsent(false); setQuickConsent(false);
    setPromo(null); setPromoInput(""); setPromoError(null);
  }
  function handleClose() { reset(); onClose(); }

  async function handleApplyPromo() {
    if (!promoInput.trim()) return;
    setPromoLoading(true); setPromoError(null);
    try {
      const result = await validatePromoCode(promoInput.trim(), total);
      setPromo(result);
      (window as any).ym?.(110458266, "reachGoal", "promo_applied", { promo_code: promoInput.trim() });
    } catch (err) {
      setPromo(null);
      setPromoError(err instanceof Error ? err.message : "Промокод не найден");
    } finally {
      setPromoLoading(false);
    }
  }

  async function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true); setError(null);
    try {
      const { confirmationUrl } = await submitCheckout(items, {
        name: form.name, phone: form.phone,
        email: form.email || undefined, delivery: form.delivery,
        comment: form.comment || undefined,
        postalCode: form.postalCode || undefined,
        address: form.address || undefined,
        apartment: form.apartment || undefined,
        contactMethod: form.contactMethod,
        contactHandle: form.contactMethod !== "Телефон" ? (form.contactHandle || undefined) : undefined,
      }, promo?.code);
      (window as any).ym?.(110458266, "reachGoal", "checkout_submitted");
      window.location.href = confirmationUrl;
    } catch (err) {
      submittingRef.current = false;
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
      setLoading(false);
    }
  }

  async function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true); setError(null);
    try {
      const { confirmationUrl } = await submitCheckout(items, { name: "Быстрый заказ", phone: quickPhone });
      (window as any).ym?.(110458266, "reachGoal", "quick_buy_submitted");
      window.location.href = confirmationUrl;
    } catch (err) {
      submittingRef.current = false;
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
      setLoading(false);
    }
  }

  const inputStyle = { fontFamily: BODY, backgroundColor: CARD, border: `1px solid ${CREAM}18`, borderRadius: 10, color: CREAM } as const;

  return (
    <>
      <div onClick={handleClose} className="fixed inset-0 z-[60] transition-opacity duration-300"
        style={{ backgroundColor: "rgba(0,0,0,0.55)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm z-[70] flex flex-col transition-transform duration-300"
        style={{ backgroundColor: "#1A1612", borderLeft: `1px solid ${CREAM}0e`, transform: open ? "translateX(0)" : "translateX(100%)" }}>
        <div className="flex items-center gap-2 px-5 h-14" style={{ borderBottom: `1px solid ${CREAM}0e` }}>
          {mode !== "cart" && (
            <button onClick={() => { setMode("cart"); setError(null); }} style={{ color: MUTED }}><ChevronLeft size={18} /></button>
          )}
          <span className="flex-1" style={{ fontFamily: JK, fontWeight: 700, fontSize: 15, color: CREAM }}>
            {mode === "cart" ? "Корзина" : mode === "checkout" ? "Оформление заказа" : "Покупка в 1 клик"}
          </span>
          <button onClick={handleClose} style={{ color: MUTED }}><X size={17} /></button>
        </div>

        {mode === "cart" && (
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {items.length > 0 && (
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ backgroundColor: `${OG}15`, border: `1px solid ${OG}35`, borderRadius: 10 }}>
                <Tag size={14} style={{ color: OG, flexShrink: 0 }} />
                <p style={{ fontFamily: MONO, fontSize: 11, color: OG }}>
                  −{FIRST_ORDER_DISCOUNT_PCT}% на первый заказ — промокод <b>{FIRST_ORDER_PROMO_CODE}</b> на шаге оформления
                </p>
              </div>
            )}
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <ShoppingBag size={36} style={{ color: FAINT }} />
                <p style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>Корзина пуста</p>
              </div>
            ) : items.map((item) => (
              <div key={item.product.id} className="flex gap-3">
                <div style={{ width: 56, height: 68, borderRadius: 10, overflow: "hidden", backgroundColor: CARD, flexShrink: 0 }}>
                  <Picture src={item.product.img} w={112} h={136} loading="lazy"
                    alt={item.product.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate mb-0.5" style={{ fontFamily: JK, fontWeight: 600, fontSize: 13, color: CREAM }}>{item.product.name}</p>
                  <p className="mb-2" style={{ fontFamily: MONO, fontSize: 11, color: OG }}>{fmt(item.product.price)}</p>
                  <div className="flex items-center gap-2">
                    {[{ d: -1, icon: <Minus size={9} /> }, null, { d: 1, icon: <Plus size={9} /> }].map((btn, i) =>
                      btn === null ? (
                        <span key={i} style={{ fontFamily: MONO, fontSize: 12, color: CREAM, width: 16, textAlign: "center" }}>{item.qty}</span>
                      ) : (
                        <button key={i} onClick={() => onQtyChange(item.product.id, btn.d)}
                          className="w-6 h-6 flex items-center justify-center transition-colors"
                          style={{ border: `1px solid ${CREAM}18`, borderRadius: 6, color: MUTED }}>
                          {btn.icon}
                        </button>
                      )
                    )}
                    <button onClick={() => onRemove(item.product.id)} className="ml-auto" style={{ color: MUTED }}><X size={11} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {mode === "checkout" && (
          <form onSubmit={handleCheckoutSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.15em" }}>— КОНТАКТЫ</p>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ИМЯ</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Как к вам обращаться" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ТЕЛЕФОН</label>
              <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7 900 000-00-00" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>EMAIL (необязательно)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@mail.ru" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
            </div>
            <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.15em", marginTop: 6 }}>— ДОСТАВКА</p>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>СПОСОБ ДОСТАВКИ</label>
              <select value={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.value })}
                className="w-full px-4 py-3 text-sm outline-none cursor-pointer" style={inputStyle}>
                {DELIVERY_METHODS.map((d) => (
                  <option key={d} value={d} disabled={DELIVERY_METHODS_DISABLED.includes(d)} style={{ background: BG }}>{d}</option>
                ))}
              </select>
            </div>
            {!form.delivery.startsWith("Самовывоз") && (
              <>
                <div>
                  <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>АДРЕС</label>
                  <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Город, улица, дом" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>КВАРТИРА/ОФИС</label>
                    <input value={form.apartment} onChange={(e) => setForm({ ...form, apartment: e.target.value })}
                      placeholder="12" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
                  </div>
                  <div className="flex-1">
                    <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ИНДЕКС</label>
                    <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                      placeholder="620000" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
                  </div>
                </div>
              </>
            )}
            {form.delivery.startsWith("Самовывоз") && (
              <p style={{ fontFamily: BODY, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                Адрес самовывоза в Екатеринбурге пришлём после подтверждения заказа.
              </p>
            )}
            <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.15em", marginTop: 6 }}>— СВЯЗЬ</p>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>СПОСОБ СВЯЗИ</label>
              <select value={form.contactMethod} onChange={(e) => setForm({ ...form, contactMethod: e.target.value })}
                className="w-full px-4 py-3 text-sm outline-none cursor-pointer" style={inputStyle}>
                {CONTACT_METHODS.map((c) => <option key={c} value={c} style={{ background: BG }}>{c}</option>)}
              </select>
            </div>
            {form.contactMethod === "ВКонтакте" && (
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>
                  ПРОФИЛЬ VK
                </label>
                {form.contactHandle ? (
                  <div className="flex items-center justify-between px-4 py-3 text-sm" style={inputStyle}>
                    <span>✓ {form.contactHandle}</span>
                    <button type="button" onClick={() => setForm({ ...form, contactHandle: "" })}
                      style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>Изменить</button>
                  </div>
                ) : (
                  <>
                    <VKLoginWidget onSuccess={(d) => setForm((f) => ({ ...f, contactHandle: d.profileUrl }))} />
                    <input value={form.contactHandle} onChange={(e) => setForm({ ...form, contactHandle: e.target.value })}
                      placeholder="или вставьте ссылку на профиль вручную: vk.com/ваш_профиль"
                      className="w-full px-4 py-3 text-sm outline-none mt-2" style={inputStyle} />
                  </>
                )}
                <p style={{ fontFamily: BODY, fontSize: 11, color: MUTED, marginTop: 6 }}>
                  После оплаты напишите первым в <a href={VK_URL} target="_blank" rel="noopener noreferrer" style={{ color: OG }}>наше сообщество ВКонтакте</a> — так мы сможем отправить вам обновления по заказу.
                </p>
              </div>
            )}
            {form.contactMethod !== "Телефон" && form.contactMethod !== "ВКонтакте" && (
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>
                  {form.contactMethod.toUpperCase()} — НИК ИЛИ НОМЕР
                </label>
                <input value={form.contactHandle} onChange={(e) => setForm({ ...form, contactHandle: e.target.value })}
                  placeholder="@username"
                  className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
              </div>
            )}
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>КОММЕНТАРИЙ (необязательно)</label>
              <textarea rows={2} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder="Пожелания к заказу" className="w-full px-4 py-3 text-sm outline-none resize-none" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ПРОМОКОД (необязательно)</label>
              {promo ? (
                <div className="flex items-center justify-between px-4 py-3 text-sm" style={{ ...inputStyle, borderColor: "#4caf7d" }}>
                  <span>✓ {promo.code} — скидка {promo.type === "percent" ? `${promo.value}%` : fmt(promo.value)}</span>
                  <button type="button" onClick={() => { setPromo(null); setPromoInput(""); }}
                    style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>Убрать</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    placeholder={`${FIRST_ORDER_PROMO_CODE} — скидка -${FIRST_ORDER_DISCOUNT_PCT}% на первый заказ`} className="flex-1 px-4 py-3 text-sm outline-none" style={inputStyle} />
                  <button type="button" onClick={handleApplyPromo} disabled={promoLoading}
                    className="px-4 text-xs tracking-widest uppercase transition-[opacity] duration-150 disabled:opacity-50"
                    style={{ border: `1px solid ${CREAM}25`, borderRadius: 10, fontFamily: MONO, color: CREAM }}>
                    {promoLoading ? "…" : "Применить"}
                  </button>
                </div>
              )}
              {promoError && <p style={{ fontFamily: BODY, fontSize: 11, color: "#E05A5A", marginTop: 6 }}>{promoError}</p>}
            </div>
            <ConsentCheckbox checked={consent} onChange={setConsent} onOpenPolicy={openPolicy} />
            {error && <p style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A" }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 text-white text-xs tracking-widest uppercase hover:brightness-110 active:scale-[0.98] transition-[filter,transform] duration-150 disabled:opacity-50"
              style={{ backgroundColor: OG, borderRadius: 12, fontFamily: MONO }}>
              {loading ? "Переходим к оплате…" : `Оплатить ${fmt(finalTotal)}`}
            </button>
            <p className="flex items-center justify-center gap-1.5" style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>
              <Shield size={11} /> Оплата через ЮKassa · возврат по закону
            </p>
          </form>
        )}

        {mode === "quick" && (
          <form onSubmit={handleQuickSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <p style={{ fontFamily: BODY, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              Оставьте телефон — оформим заказ на {fmt(total)} и сразу переведём к оплате.
            </p>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ТЕЛЕФОН</label>
              <input required type="tel" value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)}
                placeholder="+7 900 000-00-00" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
            </div>
            <ConsentCheckbox checked={quickConsent} onChange={setQuickConsent} onOpenPolicy={openPolicy} />
            {error && <p style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A" }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 text-white text-xs tracking-widest uppercase hover:brightness-110 active:scale-[0.98] transition-[filter,transform] duration-150 disabled:opacity-50"
              style={{ backgroundColor: OG, borderRadius: 12, fontFamily: MONO }}>
              {loading ? "Переходим к оплате…" : `Оплатить ${fmt(total)}`}
            </button>
            <p className="flex items-center justify-center gap-1.5" style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>
              <Shield size={11} /> Оплата через ЮKassa · возврат по закону
            </p>
          </form>
        )}

        {mode === "cart" && items.length > 0 && (
          <div className="px-5 py-5 space-y-2.5" style={{ borderTop: `1px solid ${CREAM}0e` }}>
            <div className="flex justify-between mb-1">
              <span style={{ fontFamily: BODY, fontSize: 13, color: MUTED }}>Итого</span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: CREAM }}>{fmt(total)}</span>
            </div>
            <button onClick={() => { setMode("checkout"); (window as any).ym?.(110458266, "reachGoal", "checkout_started"); }}
              className="w-full py-3.5 text-white text-xs tracking-widest uppercase hover:brightness-110 active:scale-[0.98] transition-[filter,transform] duration-150"
              style={{ backgroundColor: OG, borderRadius: 12, fontFamily: MONO }}>Оформить заказ</button>
            <button onClick={() => setMode("quick")}
              className="w-full py-3 text-xs tracking-widest uppercase active:scale-[0.98] transition-[color,transform] duration-150"
              style={{ border: `1px solid ${CREAM}15`, borderRadius: 12, fontFamily: MONO, color: MUTED }}>Купить в 1 клик</button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Floating Telegram ──────────────────────────────────────────────────────────
function FloatingCTA() {
  const [h, setH] = useState(false);
  return (
    <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer"
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 text-white shadow-2xl transition-[padding,transform] duration-200 hover:scale-105"
      style={{ backgroundColor: "#1A1412", borderRadius: 99, padding: h ? "12px 18px" : "12px 14px" }}>
      <Send size={15} />
      {h && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em" }}>Telegram</span>}
    </a>
  );
}

// ── Category card — cycles through real product photos ─────────────────────────
// ── HomePage ───────────────────────────────────────────────────────────────────
function HomePage({ products, setPage, onSelect, onAdd }: {
  products: Product[]; setPage: (p: Page) => void; onSelect: (p: Product) => void; onAdd: (p: Product) => void;
}) {
  const [gallery, setGallery] = useState<{ id: string; url: string }[]>([]);
  useEffect(() => {
    fetch("/api/gallery").then((r) => r.json()).then(setGallery).catch(() => setGallery([]));
  }, []);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [heroMedia, setHeroMedia] = useState<{ type: "image" | "video" | null; url: string | null }>({ type: null, url: null });
  useEffect(() => {
    fetch("/api/hero").then((r) => r.json()).then(setHeroMedia).catch(() => {});
  }, []);

  // Разовая анимация появления хиро-текста при первой загрузке страницы
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);
  const enter = (delay: number) => revealStyle(entered, delay);

  const revealFeatures1 = useReveal<HTMLElement>();
  const revealSpotlight = useReveal<HTMLElement>();
  const revealFeatures2 = useReveal<HTMLElement>();
  const revealCta = useReveal<HTMLElement>();
  const revealProducts = useReveal<HTMLElement>();
  const revealCategories = useReveal<HTMLElement>();
  const revealTrust = useReveal<HTMLElement>();
  const revealAbout = useReveal<HTMLElement>();
  const revealGallery = useReveal<HTMLElement>();
  const bestseller = products.find((p) => p.badge === "Хит") ?? products[0];

  return (
    <div style={{ backgroundColor: LIGHT }}>

      {/* ── HERO ── */}
      <section className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] pt-20 md:pt-24 pb-10">
        <div className="relative" style={{ borderRadius: 28, overflow: "hidden", minHeight: isMobile ? 520 : 620 }}>
          {/* Постер — фото/видео на весь блок */}
          <div className="absolute inset-0">
            {heroMedia.type === "video" && heroMedia.url ? (
              <video src={heroMedia.url} autoPlay muted loop playsInline
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : heroMedia.type === "image" && heroMedia.url ? (
              <Picture src={heroMedia.url} w={1600} h={1200} alt="" loading="eager" fetchPriority="high"
                sizes="100vw"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "linear-gradient(120deg, #4A3A29 0%, #8A6F52 60%, #B79B78 100%)" }} />
            )}
            <div className="absolute inset-0" style={{
              background: isMobile
                ? `linear-gradient(180deg, #221E18ee 0%, #221E1899 45%, #221E18cc 100%)`
                : `linear-gradient(100deg, #221E18f0 0%, #221E18cc 30%, #221E1855 56%, #221E1815 100%)`,
            }} />
          </div>

          {/* Текст поверх постера */}
          <div className="relative flex flex-col justify-center h-full" style={{ padding: isMobile ? "36px 24px" : "56px clamp(32px,4vw,64px)", minHeight: isMobile ? 520 : 620 }}>
            <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED, letterSpacing: "0.15em", marginBottom: 22, ...enter(0) }}>
              ПРЕДМЕТНЫЙ ДИЗАЙН • СОБСТВЕННОЕ ПРОИЗВОДСТВО
            </p>
            <h1 style={{
              fontFamily: SERIF, fontWeight: 500,
              fontSize: isMobile ? 34 : "clamp(34px, 3.6vw, 48px)",
              color: CREAM, lineHeight: 1.15,
              marginBottom: 20, letterSpacing: "-0.01em", maxWidth: 560,
              ...enter(90),
            }}>
              Предметы, которые создают атмосферу
            </h1>
            <p style={{
              fontFamily: BODY, fontSize: 14, color: MUTED, lineHeight: 1.65,
              marginBottom: 28, maxWidth: 340, ...enter(170),
            }}>
              Декор, светильники, украшения и изделия на заказ — созданы в нашей мастерской в Екатеринбурге.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", ...enter(250) }}>
              <button onClick={() => setPage("catalog")}
                style={{ fontFamily: JK, fontWeight: 700, fontSize: 13, backgroundColor: "#171310", color: CREAM, border: `1px solid ${CREAM}25`, borderRadius: 99, padding: "12px 26px" }}
                className="hover:brightness-125 active:scale-95 transition-[filter,transform] duration-150">
                Смотреть коллекцию
              </button>
              <button onClick={() => setPage("catalog")}
                style={{ fontFamily: JK, fontWeight: 700, fontSize: 13, backgroundColor: CREAM, color: "#1A1412", borderRadius: 99, padding: "12px 26px", border: "none" }}
                className="hover:brightness-95 active:scale-95 transition-[filter,transform] duration-150">
                Новинки
              </button>
            </div>
          </div>

          <div className="absolute bottom-5 right-6 flex items-center gap-1.5">
            <span style={{ fontFamily: LABEL, fontSize: 11, color: CREAM, opacity: 0.9 }}>Смотреть видео о бренде</span>
            <ArrowRight size={13} style={{ color: CREAM, opacity: 0.9 }} />
          </div>
        </div>
      </section>

      {/* ── Категории — витрина ── */}
      <section ref={revealFeatures1.ref} style={revealStyle(revealFeatures1.inView)}
        className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { cat: "Лампы", copy: "Скульптурный свет для любого пространства" },
            { cat: "Декор", copy: "Предметы с характером и смыслом" },
            { cat: "Украшения", copy: "Лимитированные формы и акцентные объекты" },
          ].map((row, i) => {
            const catProducts = products.filter((p) => p.category === row.cat);
            const img = catProducts[0]?.img ?? products[i % Math.max(products.length, 1)]?.img;
            if (!img) return null;
            return (
              <button key={row.cat} onClick={() => setPage("catalog")}
                className="relative overflow-hidden group text-left" style={{ aspectRatio: "4/3", borderRadius: 18, backgroundColor: CARD }}>
                <Picture src={img} w={400} h={300} alt={row.cat} loading="lazy"
                  sizes="(max-width: 767px) 45vw, 22vw"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${BG}e8 0%, ${BG}30 55%, transparent 80%)` }} />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p style={{ fontFamily: LABEL, fontSize: 9, color: `${CREAM}b0`, letterSpacing: "0.15em", marginBottom: 8 }}>{row.cat.toUpperCase()}</p>
                  <p style={{ fontFamily: BODY, fontSize: 14, color: CREAM, lineHeight: 1.3 }}>{row.copy}</p>
                  <ArrowRight size={14} className="mt-2 group-hover:translate-x-1 transition-transform duration-200" style={{ color: CREAM }} />
                </div>
              </button>
            );
          })}
          <button onClick={() => setPage("catalog")}
            className="relative overflow-hidden group text-left" style={{ aspectRatio: "4/3", borderRadius: 18, backgroundColor: CARD }}>
            {products[0] && (
              <Picture src={products[0].img} w={400} h={300} alt="Новинки" loading="lazy"
                sizes="(max-width: 767px) 45vw, 22vw"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            )}
            <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${BG}e8 0%, ${BG}30 55%, transparent 80%)` }} />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p style={{ fontFamily: LABEL, fontSize: 9, color: `${CREAM}b0`, letterSpacing: "0.15em", marginBottom: 8 }}>НОВИНКИ</p>
              <p style={{ fontFamily: BODY, fontSize: 14, color: CREAM, lineHeight: 1.3 }}>Свежие предметы в коллекции</p>
              <ArrowRight size={14} className="mt-2 group-hover:translate-x-1 transition-transform duration-200" style={{ color: CREAM }} />
            </div>
          </button>
        </div>
      </section>

      {/* ── Витрина товара — хит продаж ── */}
      {bestseller && (
        <section ref={revealSpotlight.ref} style={revealStyle(revealSpotlight.inView)}
          className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] pb-16">
          <div className="md:flex gap-0 items-stretch" style={{ backgroundColor: "#EBE3D8", borderRadius: 24, overflow: "hidden" }}>
            <div className="md:flex-1 cursor-pointer" onClick={() => onSelect(bestseller)}
              style={{ aspectRatio: "4/3", overflow: "hidden", backgroundColor: CARD }}>
              <Picture src={bestseller.img} w={700} h={560} alt={bestseller.name} loading="lazy"
                sizes="(max-width: 767px) 88vw, 44vw"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="md:flex-1 relative p-8 md:p-12">
              <div className="absolute top-8 right-8 flex flex-col items-end gap-2">
                {["01", "02", "03"].map((n) => (
                  <span key={n} style={{ fontFamily: LABEL, fontSize: 9, color: MUTED_LIGHT }}>{n}</span>
                ))}
              </div>
              <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: MUTED_LIGHT, letterSpacing: "0.15em", marginBottom: 14 }}>ХИТ</p>
              <h2 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 28, color: "#1A1412", marginBottom: 16, maxWidth: 380 }}>{bestseller.name.toUpperCase()}</h2>
              <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.7, marginBottom: 20, maxWidth: 380 }}>
                {bestseller.description || `${bestseller.category} ручной работы из студии Satori в Екатеринбурге.`}
              </p>
              <p style={{ fontFamily: SERIF, fontSize: 22, color: "#1A1412", marginBottom: 20 }}>{fmt(bestseller.price)}</p>
              <button onClick={() => onSelect(bestseller)}
                style={{ fontFamily: LABEL, fontWeight: 700, fontSize: 13, backgroundColor: "#1A1412", color: CREAM, borderRadius: 99, padding: "12px 28px", border: "none" }}
                className="hover:brightness-125 active:scale-95 transition-[filter,transform] duration-150">
                Подробнее
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Feature strip 2 — производство ── */}
      <section ref={revealFeatures2.ref} style={revealStyle(revealFeatures2.inView)}
        className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { l: "СОБСТВЕННОЕ ПРОИЗВОДСТВО", t: "Полный цикл создания от идеи до предмета" },
            { l: "МАТЕРИАЛЫ", t: "Материалы под задачу, форму и фактуру" },
            { l: "ДЛЯ ПРОФЕССИОНАЛОВ", t: "Индивидуальные решения для ваших проектов" },
          ].map((r, i) => (
            <div key={i} onClick={() => setPage("custom")} className="p-6 cursor-pointer group"
              style={{ background: "linear-gradient(150deg, #2A2118 0%, #4A3A29 100%)", borderRadius: 16 }}>
              <p style={{ fontFamily: LABEL, fontSize: 9, color: `${CREAM}90`, letterSpacing: "0.15em", marginBottom: 14 }}>{r.l}</p>
              <p style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, color: CREAM, lineHeight: 1.3, marginBottom: 18 }}>{r.t}</p>
              <span className="inline-flex items-center gap-1.5 text-xs group-hover:gap-2.5 transition-[gap] duration-200"
                style={{ fontFamily: LABEL, color: `${CREAM}b0` }}>
                Подробнее <ArrowRight size={12} />
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA — изделие на заказ ── */}
      <section ref={revealCta.ref} style={revealStyle(revealCta.inView)}
        className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] pb-16">
        <div className="md:flex gap-8 items-center p-8 md:p-12" style={{ backgroundColor: "#171310", borderRadius: 24 }}>
          <div className="md:flex-1">
            <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: `${CREAM}90`, letterSpacing: "0.15em", marginBottom: 10 }}>ИНДИВИДУАЛЬНОЕ ПРОИЗВОДСТВО</p>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, color: CREAM, marginBottom: 14, maxWidth: 480 }}>
              Нужен объект, которого нет в каталоге?
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
              Разработаем и произведём предмет интерьера под ваш проект — светильник, декор, малую мебель или другую форму.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={() => setPage("custom")}
                style={{ fontFamily: LABEL, fontWeight: 700, fontSize: 13, backgroundColor: CREAM, color: "#1A1412", borderRadius: 99, padding: "12px 28px", border: "none" }}
                className="hover:brightness-95 active:scale-95 transition-[filter,transform] duration-150">
                Обсудить объект
              </button>
              <span style={{ fontFamily: BODY, fontSize: 12, color: MUTED }}>Для частных клиентов и дизайнеров</span>
            </div>
          </div>
          <div className="mt-8 md:mt-0 md:flex-1 relative p-6" style={{ backgroundColor: "#221E18", borderRadius: 16 }}>
            <div className="flex flex-col gap-5">
              {[
                { n: "01", t: "Расскажите идею", d: "Эскиз, референс, размеры или просто задача." },
                { n: "02", t: "Мы предложим решение", d: "Форма, материал, конструкция и вариант производства." },
              ].map((s) => (
                <div key={s.n} className="flex gap-3">
                  <span style={{ fontFamily: LABEL, fontSize: 9, color: MUTED, marginTop: 3 }}>{s.n}</span>
                  <div>
                    <p style={{ fontFamily: JK, fontWeight: 600, fontSize: 14, color: CREAM, marginBottom: 4 }}>{s.t}</p>
                    <p style={{ fontFamily: BODY, fontSize: 12, color: MUTED }}>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setPage("custom")} aria-label="Обсудить объект"
              className="absolute bottom-5 right-5 active:scale-90 transition-transform duration-150" style={{ color: CREAM }}>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Хиты продаж ── */}
      <section ref={revealProducts.ref} className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16">
        <div className="flex items-center justify-between mb-8" style={revealStyle(revealProducts.inView)}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 28, color: "#1A1412" }}>Хиты продаж</h2>
          <button onClick={() => setPage("catalog")}
            className="hidden md:flex items-center gap-1.5 text-xs hover:opacity-70 active:scale-95 transition-[opacity,transform] duration-150"
            style={{ fontFamily: MONO, color: MUTED_LIGHT }}>
            Смотреть всё <ArrowRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {products.slice(0, 6).map((p, i) => (
            <div key={p.id} style={revealStyle(revealProducts.inView, Math.min(i, 5) * 60)}
              className="cursor-pointer group" onClick={() => onSelect(p)}>
              <div className="relative overflow-hidden" style={{ aspectRatio: "4/3", borderRadius: 18, backgroundColor: CARD }}>
                <Picture src={p.img} w={400} h={300} loading="lazy"
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 400px" alt={p.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
              <div className="pt-3">
                <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 12, color: "#1A1412", letterSpacing: "0.03em", marginBottom: 6 }}>{p.name.toUpperCase()}</p>
                <p style={{ fontFamily: SERIF, fontSize: 17, color: "#1A1412" }}>{fmt(p.price)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Вдохновение для вашего пространства ── */}
      <section ref={revealCategories.ref} style={revealStyle(revealCategories.inView)}
        className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] pb-16">
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, color: "#1A1412", marginBottom: 28 }}>Вдохновение для вашего пространства</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { n: "01", t: "Тихий свет" },
            { n: "02", t: "Объекты и фактуры" },
            { n: "03", t: "Малые формы" },
            { n: "04", t: "Детали пространства" },
          ].map((s, i) => {
            const img = products[(i * 2) % Math.max(products.length, 1)]?.img;
            return (
              <button key={s.n} onClick={() => setPage("catalog")} className="relative overflow-hidden group text-left"
                style={{ aspectRatio: "1/1", borderRadius: 16, backgroundColor: CARD }}>
                {img && (
                  <Picture src={img} w={400} h={400} alt={s.t} loading="lazy"
                    sizes="(max-width: 767px) 45vw, 22vw"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                )}
                <div className="absolute inset-0" style={{ background: `linear-gradient(to top, #221E18e0 0%, #221E1840 55%, transparent 80%)` }} />
                <div className="absolute top-4 left-4">
                  <span style={{ fontFamily: LABEL, fontSize: 9, color: `${CREAM}b0` }}>{s.n}</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-between">
                  <p style={{ fontFamily: JK, fontWeight: 600, fontSize: 14, color: CREAM }}>{s.t}</p>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform duration-200" style={{ color: CREAM }} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section ref={revealTrust.ref}
        style={{ borderTop: `1px solid rgba(0,0,0,0.08)`, borderBottom: `1px solid rgba(0,0,0,0.08)`, ...revealStyle(revealTrust.inView) }}
        className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {[
            { n: "01", t: "Собственное производство", d: "Создаём предметы сами" },
            { n: "02", t: "Материалы под задачу", d: "Подбираем материал под форму и задачу" },
            { n: "03", t: "Ручная сборка", d: "Внимание к деталям" },
            { n: "04", t: "Бережная доставка", d: "Яндекс · СДЭК · Почта России" },
            { n: "05", t: "Поддержка и сервис", d: "Остаёмся на связи после покупки" },
          ].map((s) => (
            <div key={s.n} className="flex gap-3">
              <span style={{ fontFamily: LABEL, fontSize: 9, color: MUTED_LIGHT, marginTop: 3 }}>{s.n}</span>
              <div>
                <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 13, color: "#1A1412", lineHeight: 1.3, marginBottom: 4 }}>{s.t}</p>
                <p style={{ fontFamily: BODY, fontSize: 11, color: MUTED_LIGHT, lineHeight: 1.4 }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── About strip ── */}
      <section ref={revealAbout.ref} style={{ borderTop: `1px solid ${CREAM}0c`, ...revealStyle(revealAbout.inView) }}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="relative overflow-hidden" style={{ minHeight: 400 }}>
            <Picture loading="lazy" src="/uploads/808b2dea-fe9a-4a1d-a04c-b0df28a0947a.png" w={960} h={640}
              sizes="(max-width: 767px) 100vw, 50vw"
              alt="Студия" className="w-full h-full object-cover absolute inset-0" style={{ backgroundColor: CARD }} />
            <div className="absolute inset-0" style={{ backgroundColor: `${BG}40` }} />
            <div className="absolute top-6 left-6" style={{ backgroundColor: "#1A1412", borderRadius: 8, padding: "6px 12px" }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: CREAM, letterSpacing: "0.2em" }}>3D-СТУДИЯ · ЕКАТЕРИНБУРГ</span>
            </div>
            <div className="absolute bottom-6 right-6 p-4 text-right"
              style={{ backgroundColor: `${BG}bb`, backdropFilter: "blur(8px)", borderRadius: 12, border: `1px solid ${CREAM}15` }}>
              <p style={{ fontFamily: JK, fontWeight: 800, fontSize: 28, color: CREAM }}>-30%</p>
              <p style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>на первый заказ</p>
            </div>
          </div>
          <div className="px-8 md:px-12 py-14 flex flex-col justify-center" style={{ backgroundColor: "#111009" }}>
            <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: `${CREAM}90`, letterSpacing: "0.3em", marginBottom: 14 }}>— О СТУДИИ</p>
            <h2 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 26, color: CREAM, lineHeight: 1.2, marginBottom: 18 }}>
              Момент, когда идея<br />становится предметом
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.7, marginBottom: 24 }}>
              «Сатори» — японское слово для мгновенного озарения. Каждое изделие: от 3D-модели в Nomad Sculpt до финишной обработки руками мастера.
            </p>
            <button onClick={() => setPage("about")}
              className="flex items-center gap-2 self-start text-xs hover:gap-3 transition-[gap] duration-200"
              style={{ fontFamily: MONO, color: CREAM }}>
              Узнать больше <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Галерея ── */}
      {gallery.length > 0 && (
        <section ref={revealGallery.ref} style={revealStyle(revealGallery.inView)}
          className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] pb-16">
          <div className="flex items-center gap-2 mb-5">
            <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: "0.15em" }}>ГАЛЕРЕЯ</span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {gallery.map((p) => (
              <div key={p.id} className="aspect-square overflow-hidden group cursor-pointer" style={{ borderRadius: 12 }}>
                <Picture loading="lazy" src={p.url} w={320} h={320} alt=""
                  sizes="(max-width: 767px) 33vw, 16vw"
                  className="w-full h-full object-cover transition-[transform,filter] duration-500 group-hover:scale-110 group-hover:brightness-75"
                  style={{ backgroundColor: CARD }} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Grid product card ──────────────────────────────────────────────────────────
function GridCard({ product, onSelect }: {
  product: Product; onSelect: (p: Product) => void; onAdd: (p: Product) => void;
}) {
  const [liked, setLiked] = useState(false);
  return (
    <div className="relative cursor-pointer group"
      onClick={() => onSelect(product)}>
      <div className="relative overflow-hidden" style={{ aspectRatio: "4/5", borderRadius: 16, backgroundColor: CARD }}>
        <Picture src={product.img} w={450} h={560} loading="lazy"
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 400px" alt={product.name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundColor: "#2A2118", filter: "brightness(1.25) contrast(1.05)" }} />
        {product.badge && (
          <div className="absolute top-3 left-3">
            <span style={{
              fontFamily: LABEL, fontWeight: 600, fontSize: 9, letterSpacing: "0.1em",
              backgroundColor: CREAM, color: "#13100C",
              padding: "4px 9px", borderRadius: 99,
            }}>{product.badge.toUpperCase()}</span>
          </div>
        )}
        <button onClick={(e) => { e.stopPropagation(); setLiked((v) => !v); }} aria-label={liked ? "Убрать из избранного" : "В избранное"}
          className="absolute top-3 right-3 active:scale-90 transition-transform duration-150">
          <Heart size={17} style={{ color: "#1A1412" }} fill={liked ? "#1A1412" : "none"} />
        </button>
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px]"
            style={{ backgroundColor: `${BG}b3` }}>
            <span style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: CREAM, border: `1px solid ${CREAM}40`, backgroundColor: `${BG}90`, padding: "6px 14px", borderRadius: 8, whiteSpace: "nowrap" }}>
              Под заказ · {product.lead}
            </span>
          </div>
        )}
      </div>
      <div className="pt-3">
        <p style={{ fontFamily: LABEL, fontSize: 9, color: MUTED_LIGHT, letterSpacing: "0.1em", marginBottom: 4 }}>{product.category.toUpperCase()}</p>
        <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 14, color: "#1A1412", lineHeight: 1.25, marginBottom: 6 }}>{product.name}</p>
        <span style={{ fontFamily: SERIF, fontSize: 15, color: "#1A1412" }}>{fmt(product.price)}</span>
      </div>
    </div>
  );
}

// ── Catalog Page ───────────────────────────────────────────────────────────────
function CatalogPage({ products, onSelect, onAdd, setPage }: { products: Product[]; onSelect: (p: Product) => void; onAdd: (p: Product) => void; setPage: (p: Page) => void }) {
  const [cat, setCat] = useState("Все");
  const [sort, setSort] = useState("new");
  const cats = ["Все", ...CATEGORIES, "Новинки"];
  const filtered = products
    .filter((p) => cat === "Все" || (cat === "Новинки" ? p.badge === "Новинка" : p.category === cat))
    .sort((a, b) => sort === "price_asc" ? a.price - b.price : sort === "price_desc" ? b.price - a.price : 0);

  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-12">
        <div className="flex items-start justify-between mb-3">
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 34, color: "#1A1412" }}>КАТАЛОГ</h1>
          <span style={{ fontFamily: LABEL, fontSize: 11, color: MUTED_LIGHT, marginTop: 10 }}>{products.length} предметов</span>
        </div>
        <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.6, marginBottom: 32 }}>
          Лампы, декор, украшения и изделия на заказ.<br />Созданы в собственной мастерской SATORI.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-5"
          style={{ borderBottom: `1px solid rgba(0,0,0,0.08)` }}>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                className="px-4 py-2 text-xs transition-colors"
                style={{
                  fontFamily: LABEL, fontWeight: 600, borderRadius: 99,
                  backgroundColor: cat === c ? "#1A1412" : "transparent",
                  border: `1px solid ${cat === c ? "#1A1412" : "rgba(0,0,0,0.15)"}`,
                  color: cat === c ? CREAM : MUTED_LIGHT,
                }}>{c}</button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="bg-transparent text-xs px-4 py-2 outline-none cursor-pointer"
              style={{ fontFamily: LABEL, fontWeight: 600, border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 99, color: MUTED_LIGHT }}>
              <option value="new" style={{ background: LIGHT }}>Сначала новые</option>
              <option value="price_asc" style={{ background: LIGHT }}>Цена ↑</option>
              <option value="price_desc" style={{ background: LIGHT }}>Цена ↓</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p) => <GridCard key={p.id} product={p} onSelect={onSelect} onAdd={onAdd} />)}
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-24" style={{ fontFamily: MONO, fontSize: 11, color: MUTED_LIGHT }}>Нет изделий</div>
        )}

        {/* ── CTA — изделие на заказ ── */}
        <div className="md:flex gap-8 items-center p-8 md:p-12 mt-16" style={{ backgroundColor: "#171310", borderRadius: 24 }}>
          <div className="md:flex-1">
            <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: `${CREAM}90`, letterSpacing: "0.15em", marginBottom: 10 }}>ИНДИВИДУАЛЬНОЕ ПРОИЗВОДСТВО</p>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, color: CREAM, marginBottom: 14, maxWidth: 480 }}>
              Не нашли нужный объект?
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
              Пришлите референс, эскиз или просто опишите задачу. Мы предложим форму, материал и вариант производства.
            </p>
            <button onClick={() => setPage("custom")}
              style={{ fontFamily: LABEL, fontWeight: 700, fontSize: 13, backgroundColor: CREAM, color: "#1A1412", borderRadius: 99, padding: "12px 28px", border: "none" }}
              className="hover:brightness-95 active:scale-95 transition-[filter,transform] duration-150">
              Обсудить объект
            </button>
          </div>
          <div className="mt-8 md:mt-0 md:flex-1 relative p-6" style={{ backgroundColor: "#221E18", borderRadius: 16 }}>
            <div className="flex flex-col gap-5">
              {[
                { n: "01", t: "Расскажите, что нужно" },
                { n: "02", t: "Получите предложение" },
              ].map((s) => (
                <div key={s.n} className="flex gap-3 items-center">
                  <span style={{ fontFamily: LABEL, fontSize: 9, color: MUTED }}>{s.n}</span>
                  <p style={{ fontFamily: JK, fontWeight: 600, fontSize: 14, color: CREAM }}>{s.t}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setPage("custom")} aria-label="Обсудить объект"
              className="absolute bottom-5 right-5 active:scale-90 transition-transform duration-150" style={{ color: CREAM }}>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Limited Edition Page — numbered, one-off series ─────────────────────────────
function LimitedPage({ products, onSelect, onAdd }: {
  products: Product[]; onSelect: (p: Product) => void; onAdd: (p: Product) => void;
}) {
  const limited = products.filter((p) => p.limitedEdition);
  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-12">
        <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: MUTED_LIGHT, letterSpacing: "0.3em", marginBottom: 6 }}>— ОГРАНИЧЕННАЯ СЕРИЯ</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 36, color: "#1A1412", marginBottom: 16 }}>Лимитированная серия</h1>
        <p style={{ fontFamily: BODY, fontSize: 14, color: MUTED_LIGHT, lineHeight: 1.7, maxWidth: 560, marginBottom: 36 }}>
          Каждое изделие этой серии выпущено ограниченным тиражом и пронумеровано вручную. Когда экземпляры закончатся — повтора не будет.
        </p>
        {limited.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {limited.map((p) => <GridCard key={p.id} product={p} onSelect={onSelect} onAdd={onAdd} />)}
          </div>
        ) : (
          <div className="text-center py-24" style={{ fontFamily: MONO, fontSize: 11, color: MUTED_LIGHT }}>Пока нет изделий в этой серии</div>
        )}
      </div>
    </div>
  );
}

// ── Product Page — matches reference: image top, light card below ──────────────
function ProductPage({ product, products, onBack, onAdd, onSelect, onCartOpen }: {
  product: Product; products: Product[]; onBack: () => void; onAdd: (p: Product) => void; onSelect: (p: Product) => void; onCartOpen: () => void;
}) {
  const [activeImg, setActiveImg] = useState(0);
  const [colorOverrideImg, setColorOverrideImg] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const imgs = product.imgs?.length
    ? [product.img, ...product.imgs.filter((i) => i !== product.img)]
    : [product.img];
  const DESC_LIMIT = 180;
  const description = product.description ?? "";
  const descIsLong = description.length > DESC_LIMIT;
  const descShown = descExpanded || !descIsLong ? description : description.slice(0, DESC_LIMIT).trimEnd() + "…";
  const related = products.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 3);

  useEffect(() => {
    pushEcommerce({
      currencyCode: "RUB",
      detail: { products: [{ id: String(product.id), name: product.name, price: product.price, category: product.category }] },
    });
  }, [product.id]);

  function handleAdd() {
    for (let i = 0; i < qty; i++) onAdd(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  const specs = [
    { l: "Размеры", v: product.dims },
    { l: "Материал", v: product.material },
    { l: "Вес", v: product.weight },
    { l: "Цвета", v: product.colors ? `${product.colors} ${product.colors === 1 ? "вариант" : "варианта"}` : undefined },
  ].filter((s) => s.v);

  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-10">
        <button onClick={onBack} className="flex items-center gap-1.5 mb-6 transition-colors" style={{ color: MUTED_LIGHT }}>
          <ChevronLeft size={16} />
          <span style={{ fontFamily: LABEL, fontSize: 10, letterSpacing: "0.1em" }}>НАЗАД</span>
        </button>

        <div className="md:flex md:gap-8 md:items-stretch">
          {/* Image left */}
          <div className="relative overflow-hidden md:flex-1" style={{ aspectRatio: "1/1", borderRadius: 24, backgroundColor: CARD }}>
            <Picture src={colorOverrideImg ?? imgs[activeImg]} w={800} h={800}
              loading="eager" fetchPriority="high"
              sizes="(max-width: 768px) 100vw, 600px" alt={product.name}
              className="w-full h-full object-cover transition-opacity duration-300"
              style={{ objectPosition: "center 20%" }} />
            {product.badge && (
              <div className="absolute top-4 left-4">
                <span style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 9, letterSpacing: "0.1em", backgroundColor: CREAM, color: "#1A1412", padding: "5px 12px", borderRadius: 99 }}>
                  {product.badge.toUpperCase()}
                </span>
              </div>
            )}
            {imgs.length > 1 && (
              <>
                <button onClick={() => { setActiveImg((activeImg - 1 + imgs.length) % imgs.length); setColorOverrideImg(null); }}
                  aria-label="Предыдущее фото"
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-transform"
                  style={{ backgroundColor: LIGHT, color: "#1A1412" }}>
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => { setActiveImg((activeImg + 1) % imgs.length); setColorOverrideImg(null); }}
                  aria-label="Следующее фото"
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-transform"
                  style={{ backgroundColor: LIGHT, color: "#1A1412" }}>
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>

          {/* Info right */}
          <div className="mt-6 md:mt-0 md:flex-1 p-6 md:p-8" style={{ backgroundColor: "#fff", borderRadius: 24, border: `1px solid rgba(0,0,0,0.06)` }}>
            <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED_LIGHT, letterSpacing: "0.1em", marginBottom: 12 }}>{product.category.toUpperCase()}</p>
            <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 32, lineHeight: 1.15, color: "#1A1412", marginBottom: 6 }}>{product.name}</h1>
            <p style={{ fontFamily: SERIF, fontSize: 22, color: "#1A1412", marginBottom: 16 }}>{fmt(product.price)}</p>

            {product.limitedEdition && product.editionNumber && product.editionTotal && (
              <div className="flex items-center gap-2 mb-4 px-3.5 py-2.5" style={{ backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 10 }}>
                <Sparkles size={14} style={{ color: "#1A1412", flexShrink: 0 }} />
                <p style={{ fontFamily: BODY, fontSize: 11, color: "#1A1412", lineHeight: 1.5 }}>
                  Экземпляр №{product.editionNumber} из {product.editionTotal} · ограниченная серия, повтора не будет
                </p>
              </div>
            )}

            <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.65, marginBottom: descIsLong ? 4 : 20 }}>
              {descShown}
            </p>
            {descIsLong && (
              <button type="button" onClick={() => setDescExpanded((v) => !v)}
                className="mb-5 block" style={{ fontFamily: LABEL, fontSize: 11, color: "#1A1412", fontWeight: 600 }}>
                {descExpanded ? "Свернуть" : "Читать полностью"}
              </button>
            )}

            {specs.length > 0 && (
              <div className="mb-5">
                <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED_LIGHT, letterSpacing: "0.1em", marginBottom: 10 }}>ХАРАКТЕРИСТИКИ</p>
                {specs.map((s) => (
                  <div key={s.l} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid rgba(0,0,0,0.07)` }}>
                    <span style={{ fontFamily: BODY, fontSize: 12, color: MUTED_LIGHT }}>{s.l}</span>
                    <span style={{ fontFamily: BODY, fontSize: 12, color: "#1A1412", fontWeight: 500 }}>{s.v}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
              {product.colorSwatches && product.colorSwatches.length > 0 && (
                <div>
                  <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED_LIGHT, letterSpacing: "0.1em", marginBottom: 10 }}>ЦВЕТ / ВАРИАНТ</p>
                  <div className="flex items-center gap-2.5">
                    {product.colorSwatches.map((c, i) => (
                      <button key={i} type="button" onClick={() => c.img && setColorOverrideImg(c.img)}
                        style={{
                          width: 24, height: 24, borderRadius: 99, backgroundColor: c.color,
                          cursor: c.img ? "pointer" : "default",
                          boxShadow: colorOverrideImg === c.img && c.img
                            ? `0 0 0 2px #fff, 0 0 0 4px #1A1412`
                            : "0 0 0 1px rgba(0,0,0,0.15)",
                        }} />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED_LIGHT, letterSpacing: "0.1em", marginBottom: 10 }}>ДОСТАВКА</p>
                <p style={{ fontFamily: BODY, fontSize: 12, color: "#1A1412" }}>СДЭК · Почта России · Самовывоз</p>
              </div>
            </div>

            {/* Qty row */}
            <div className="flex gap-3 mb-3">
              <div className="flex items-center" style={{ border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 10 }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Уменьшить количество"
                  className="w-10 h-12 flex items-center justify-center active:scale-90 transition-transform duration-150" style={{ color: MUTED_LIGHT }}><Minus size={11} /></button>
                <span style={{ fontFamily: BODY, fontSize: 13, color: "#1A1412", width: 28, textAlign: "center" }}>{qty}</span>
                <button onClick={() => setQty(qty + 1)} aria-label="Увеличить количество"
                  className="w-10 h-12 flex items-center justify-center active:scale-90 transition-transform duration-150" style={{ color: MUTED_LIGHT }}><Plus size={11} /></button>
              </div>
              <button onClick={handleAdd} disabled={added}
                className="flex-1 text-xs tracking-widest uppercase font-bold hover:brightness-125 active:scale-[0.97] transition-[filter,transform] duration-150"
                style={{ backgroundColor: added ? "#1f7a4d" : "#1A1412", color: CREAM, borderRadius: 12, fontFamily: LABEL, fontSize: 13, fontWeight: 700 }}>
                {added ? "✓ Добавлено" : "В корзину"}
              </button>
            </div>
            <button onClick={() => { onAdd(product); onCartOpen(); }}
              className="w-full py-3 text-xs font-semibold active:scale-[0.98] transition-[color,transform] duration-150"
              style={{ border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 12, fontFamily: LABEL, color: MUTED_LIGHT }}>
              Купить в 1 клик
            </button>
          </div>
        </div>

        {/* Thumbnail row */}
        {imgs.length > 1 && (
          <div className="flex gap-3 mt-4 overflow-x-auto">
            {imgs.map((img, i) => (
              <button key={i} onClick={() => { setActiveImg(i); setColorOverrideImg(null); }}
                className="overflow-hidden transition-[box-shadow,opacity] duration-200 shrink-0"
                style={{ width: 96, aspectRatio: "1/1", borderRadius: 14,
                  boxShadow: i === activeImg && !colorOverrideImg ? `0 0 0 2px #1A1412` : "0 0 0 1px rgba(0,0,0,0.08)",
                  opacity: i === activeImg && !colorOverrideImg ? 1 : 0.6 }}>
                <Picture loading="lazy" src={img} w={192} h={192} alt="" className="w-full h-full object-cover" style={{ backgroundColor: CARD }} />
              </button>
            ))}
          </div>
        )}

        {/* Handmade / care / warranty strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 p-6 md:p-8" style={{ backgroundColor: "#fff", borderRadius: 24, border: `1px solid rgba(0,0,0,0.06)` }}>
          <div>
            <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED_LIGHT, letterSpacing: "0.1em", marginBottom: 8 }}>О РУЧНОЙ РАБОТЕ</p>
            <p style={{ fontFamily: BODY, fontSize: 13, color: "#1A1412", lineHeight: 1.6 }}>Каждый объект создаётся вручную в нашей мастерской с вниманием к деталям и материалам.</p>
          </div>
          <div>
            <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED_LIGHT, letterSpacing: "0.1em", marginBottom: 8 }}>УХОД</p>
            <p style={{ fontFamily: BODY, fontSize: 13, color: "#1A1412", lineHeight: 1.6 }}>Протирайте сухой мягкой тканью. Не используйте абразивные средства.</p>
          </div>
          <div>
            <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED_LIGHT, letterSpacing: "0.1em", marginBottom: 8 }}>ГАРАНТИЯ</p>
            <p style={{ fontFamily: BODY, fontSize: 13, color: "#1A1412", lineHeight: 1.6 }}>{product.watt ? "1 год на электрическую часть изделия." : "Гарантия качества изготовления."}</p>
          </div>
        </div>

        {/* Related — horizontal cards */}
        {related.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center justify-between mb-6">
              <h2 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 24, color: "#1A1412" }}>Сочетается с</h2>
              <button onClick={() => onSelect(related[0])} className="hidden md:flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity"
                style={{ fontFamily: LABEL, color: MUTED_LIGHT }}>
                Смотреть всё <ArrowRight size={12} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {related.map((p) => (
                <div key={p.id} onClick={() => onSelect(p)} className="flex items-center gap-4 p-4 cursor-pointer group"
                  style={{ backgroundColor: "#fff", borderRadius: 18, border: `1px solid rgba(0,0,0,0.06)` }}>
                  <div className="shrink-0 overflow-hidden" style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: CARD }}>
                    <Picture src={p.img} w={128} h={128} loading="lazy" alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: "#1A1412", letterSpacing: "0.05em", marginBottom: 4 }} className="truncate">{p.name.toUpperCase()}</p>
                    <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT }}>{fmt(p.price)}</p>
                  </div>
                  <ArrowRight size={14} className="shrink-0 group-hover:translate-x-1 transition-transform duration-200" style={{ color: MUTED_LIGHT }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trust bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 p-6" style={{ backgroundColor: "#fff", borderRadius: 18, border: `1px solid rgba(0,0,0,0.06)` }}>
          {[
            { t: "БЕЗОПАСНАЯ ОПЛАТА" }, { t: "ВОЗВРАТ В ТЕЧЕНИЕ 7 ДНЕЙ" }, { t: "ПОДДЕРЖКА В TELEGRAM" },
          ].map((s) => (
            <p key={s.t} className="text-center" style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED_LIGHT, letterSpacing: "0.1em" }}>{s.t}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── About Page ─────────────────────────────────────────────────────────────────
function AboutPage() {
  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="relative h-64 md:h-80 overflow-hidden">
        <Picture loading="eager" fetchPriority="high" src="/uploads/808b2dea-fe9a-4a1d-a04c-b0df28a0947a.png" w={1280} h={320}
          sizes="100vw"
          alt="Студия" className="w-full h-full object-cover" style={{ backgroundColor: CARD }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 30%, ${BG})` }} />
        <div className="absolute bottom-8 left-6 md:left-14">
          <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: `${CREAM}90`, letterSpacing: "0.3em", marginBottom: 8 }}>— ИСТОРИЯ</p>
          <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 32, color: CREAM }}>О студии и мастере</h1>
        </div>
      </div>
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-12 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-14">
          <div style={{ fontFamily: BODY, fontSize: 13, lineHeight: 1.75, color: MUTED_LIGHT }}>
            <p style={{ color: "#1A1412", fontSize: 15, marginBottom: 16 }}>«Сатори» — момент мгновенного озарения в дзен. Именно этот момент я пытаюсь поймать в каждом изделии.</p>
            <p style={{ marginBottom: 12 }}>Студия началась с одного принтера и Nomad Sculpt на iPad. Хотелось создавать предметы с характером, историей, тактильностью.</p>
            <p>Три года спустя принтер тот же — но опыта и отточенных процессов стало гораздо больше.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ n: "1", l: "принтер" }, { n: "3+", l: "года на рынке" }, { n: "100%", l: "ручная работа" }, { n: "-30%", l: "на первый заказ" }].map((s) => (
              <div key={s.l} className="p-5 flex flex-col gap-1" style={{ backgroundColor: BG, borderRadius: 14 }}>
                <p style={{ fontFamily: JK, fontWeight: 800, fontSize: 26, color: CREAM }}>{s.n}</p>
                <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}90` }}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid rgba(0,0,0,0.08)`, paddingTop: 48 }}>
          <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: MUTED_LIGHT, letterSpacing: "0.3em", marginBottom: 8 }}>— ПРОЦЕСС</p>
          <h2 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 26, color: "#1A1412", marginBottom: 28 }}>От идеи до вашего стола</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { n: "01", t: "Концепция в Nomad Sculpt", b: "Органическое 3D-лепление на iPad — как настоящая скульптура, только цифровая." },
              { n: "02", t: "Подготовка к печати", b: "Модель оптимизируется: стенки, поддержки, ориентация — всё влияет на прочность." },
              { n: "03", t: "3D-печать", b: "FDM или смоляная печать в зависимости от объекта. Слой за слоем." },
              { n: "04", t: "Финишная обработка", b: "Шлифовка, грунтование, покраска. Здесь изделие получает свой финальный характер." },
            ].map((s) => (
              <div key={s.n} className="p-5 flex gap-4" style={{ backgroundColor: BG, borderRadius: 14 }}>
                <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}70`, flexShrink: 0, marginTop: 2 }}>{s.n}</p>
                <div>
                  <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 14, color: CREAM, marginBottom: 6 }}>{s.t}</p>
                  <p style={{ fontFamily: BODY, fontSize: 12, color: `${CREAM}b0`, lineHeight: 1.6 }}>{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Custom Order Page ──────────────────────────────────────────────────────────
function CustomOrderPage({ setPage }: { setPage: (p: Page) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", contact: "", idea: "", budget: "" });
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "custom", ...form }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Не удалось отправить");
      setSent(true);
      (window as any).ym?.(110458266, "reachGoal", "lead_custom_submitted");
    } catch (err) {
      submittingRef.current = false;
      setError(err instanceof Error ? err.message : "Что-то пошло не так, попробуйте ещё раз");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = { fontFamily: BODY, backgroundColor: "#fff", border: `1px solid rgba(0,0,0,0.12)`, borderRadius: 10, color: "#1A1412" } as const;
  const labelStyle = { fontFamily: MONO, fontSize: 9, color: MUTED_LIGHT, letterSpacing: "0.15em", display: "block", marginBottom: 8 } as const;
  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-2xl">
        <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: MUTED_LIGHT, letterSpacing: "0.3em", marginBottom: 8 }}>— НА ЗАКАЗ</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 34, color: "#1A1412", marginBottom: 12 }}>Изделие на заказ</h1>
        <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.65, marginBottom: 36 }}>
          Расскажите об идее — обсудим детали, согласуем 3D-модель до начала производства.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-10">
          {["Бриф", "Согласование", "Производство"].map((s, i) => (
            <div key={s} className="p-4 text-center" style={{ backgroundColor: "#fff", borderRadius: 14, border: `1px solid rgba(0,0,0,0.08)` }}>
              <div className="w-7 h-7 flex items-center justify-center text-xs font-bold mx-auto mb-2"
                style={{ backgroundColor: "#1A1412", color: CREAM, borderRadius: 99, fontFamily: JK }}>
                {i + 1}
              </div>
              <p style={{ fontFamily: JK, fontWeight: 600, fontSize: 12, color: "#1A1412" }}>{s}</p>
            </div>
          ))}
        </div>
        {sent ? (
          <div className="p-10 text-center" style={{ border: `1px solid rgba(0,0,0,0.1)`, backgroundColor: "#fff", borderRadius: 16 }}>
            <Check size={28} className="mx-auto mb-4" style={{ color: "#1A1412" }} />
            <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: "#1A1412", marginBottom: 8 }}>Бриф отправлен!</p>
            <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT }}>Напишем в течение 24 часов.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label style={labelStyle}>ИМЯ</label>
              <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Как вас зовут" className="w-full px-4 py-3 text-sm placeholder-opacity-30 outline-none transition-colors" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>ТЕЛЕФОН</label>
              <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7 900 000-00-00" className="w-full px-4 py-3 text-sm placeholder-opacity-30 outline-none transition-colors" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>TELEGRAM ИЛИ EMAIL (НЕОБЯЗАТЕЛЬНО)</label>
              <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="@username или email@mail.ru" className="w-full px-4 py-3 text-sm placeholder-opacity-30 outline-none transition-colors" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>ИДЕЯ / ОПИСАНИЕ</label>
              <textarea value={form.idea} onChange={(e) => setForm({ ...form, idea: e.target.value })}
                placeholder="Опишите что хотите — материал, назначение, вдохновение..." rows={5}
                className="w-full px-4 py-3 text-sm outline-none transition-colors resize-none" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>БЮДЖЕТ</label>
              <select value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="w-full px-4 py-3 text-sm outline-none cursor-pointer" style={{ ...inputStyle, color: form.budget ? "#1A1412" : MUTED_LIGHT }}>
                <option value="" style={{ background: "#fff" }}>Выберите диапазон</option>
                {["до 5 000 ₽","5 000 – 15 000 ₽","15 000 – 30 000 ₽","от 30 000 ₽"].map((o) => <option key={o} style={{ background: "#fff" }}>{o}</option>)}
              </select>
            </div>
            <ConsentCheckbox checked={consent} onChange={setConsent} onOpenPolicy={() => setPage("privacy")} onLight />
            {error && <p style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A" }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="px-10 py-4 text-sm font-bold hover:brightness-125 active:scale-[0.98] transition-[filter,opacity,transform] duration-150 disabled:opacity-50"
              style={{ backgroundColor: "#1A1412", color: CREAM, borderRadius: 12, fontFamily: JK }}>
              {loading ? "Отправляем…" : "Отправить бриф"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Business Page ────────────────────────────────────────────────────────────
function BusinessPage({ setPage }: { setPage: (p: Page) => void }) {
  const [form, setForm] = useState({ company: "", name: "", phone: "", email: "", type: "", volume: "", comment: "" });
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true); setError(null);
    try {
      const { type: inquiryType, ...rest } = form;
      const res = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "business", inquiryType, ...rest }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Не удалось отправить");
      setSent(true);
      (window as any).ym?.(110458266, "reachGoal", "lead_business_submitted");
    } catch (err) {
      submittingRef.current = false;
      setError(err instanceof Error ? err.message : "Что-то пошло не так, попробуйте ещё раз");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = { fontFamily: BODY, backgroundColor: "#fff", border: `1px solid rgba(0,0,0,0.12)`, borderRadius: 10, color: "#1A1412" } as const;
  const labelStyle = { fontFamily: MONO, fontSize: 9, color: MUTED_LIGHT, letterSpacing: "0.15em", display: "block", marginBottom: 8 } as const;

  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-5xl">
        <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: MUTED_LIGHT, letterSpacing: "0.3em", marginBottom: 8 }}>— ДЛЯ БИЗНЕСА</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 34, color: "#1A1412", marginBottom: 12 }}>Опт и корпоративные подарки</h1>
        <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.65, marginBottom: 36, maxWidth: 560 }}>
          Поставляем авторские 3D-объекты магазинам и шоурумам, а также делаем брендированные подарки
          для компаний — от небольшой партии до постоянного сотрудничества.
        </p>

        {/* Trust stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-14">
          {[{ n: "1", l: "принтер в студии" }, { n: "3+", l: "года на рынке" }, { n: "100%", l: "ручная работа" }, { n: "-30%", l: "на первый заказ" }].map((s) => (
            <div key={s.l} className="p-4" style={{ backgroundColor: "#fff", borderRadius: 14, border: `1px solid rgba(0,0,0,0.08)` }}>
              <p style={{ fontFamily: JK, fontWeight: 800, fontSize: 22, color: "#1A1412", marginBottom: 2 }}>{s.n}</p>
              <p style={{ fontFamily: MONO, fontSize: 9, color: MUTED_LIGHT }}>{s.l}</p>
            </div>
          ))}
        </div>

        {/* Two tracks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
          <div className="p-6" style={{ backgroundColor: "#fff", borderRadius: 16, border: `1px solid rgba(0,0,0,0.08)` }}>
            <div className="w-9 h-9 flex items-center justify-center mb-4" style={{ backgroundColor: "#1A1412", borderRadius: 10, color: CREAM }}>
              <Package size={16} />
            </div>
            <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: "#1A1412", marginBottom: 10 }}>Опт — магазинам и шоурумам</h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.6, marginBottom: 16 }}>
              Поставляем готовые коллекции и позволяем формировать ассортимент под ваш формат.
            </p>
            <ul className="space-y-2.5">
              {["От 10 изделий — скидка 15%", "От 30 изделий — скидка 25%", "Индивидуальные условия для постоянных партнёров", "Отсрочка платежа обсуждается отдельно"].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check size={13} style={{ color: "#1A1412", flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.5 }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="p-6" style={{ backgroundColor: "#fff", borderRadius: 16, border: `1px solid rgba(0,0,0,0.08)` }}>
            <div className="w-9 h-9 flex items-center justify-center mb-4" style={{ backgroundColor: "#1A1412", borderRadius: 10, color: CREAM }}>
              <Sparkles size={16} />
            </div>
            <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: "#1A1412", marginBottom: 10 }}>Корпоративные подарки</h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.6, marginBottom: 16 }}>
              Брендируем существующие изделия или разрабатываем индивидуальный дизайн под вашу компанию.
            </p>
            <ul className="space-y-2.5">
              {["Гравировка логотипа или имени", "Индивидуальный дизайн под бриф", "Единая упаковка для всей партии", "Сроки — от 2 недель в зависимости от тиража"].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check size={13} style={{ color: "#1A1412", flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.5 }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Inquiry form */}
        <div style={{ borderTop: `1px solid rgba(0,0,0,0.08)`, paddingTop: 40 }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 22, color: "#1A1412", marginBottom: 8 }}>Оставить заявку</h2>
          <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.6, marginBottom: 28, maxWidth: 480 }}>
            Расскажите о задаче — свяжемся в течение рабочего дня и обсудим условия.
          </p>
          {sent ? (
            <div className="p-10 text-center max-w-lg" style={{ border: `1px solid rgba(0,0,0,0.1)`, backgroundColor: "#fff", borderRadius: 16 }}>
              <Check size={28} className="mx-auto mb-4" style={{ color: "#1A1412" }} />
              <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: "#1A1412", marginBottom: 8 }}>Заявка отправлена!</p>
              <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT }}>Свяжемся с вами в течение рабочего дня.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              <div>
                <label style={labelStyle}>КОМПАНИЯ</label>
                <input required type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Название компании" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>КОНТАКТНОЕ ЛИЦО</label>
                <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Как к вам обращаться" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ТЕЛЕФОН</label>
                <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+7 900 000-00-00" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>EMAIL (НЕОБЯЗАТЕЛЬНО)</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@mail.ru" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ТИП СОТРУДНИЧЕСТВА</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-4 py-3 text-sm outline-none cursor-pointer" style={{ ...inputStyle, color: form.type ? "#1A1412" : MUTED_LIGHT }}>
                  <option value="" style={{ background: "#fff" }}>Выберите вариант</option>
                  {["Опт", "Корпоративные подарки", "Пока не уверен(а)"].map((o) => <option key={o} style={{ background: "#fff" }}>{o}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label style={labelStyle}>ОРИЕНТИРОВОЧНЫЙ ОБЪЁМ</label>
                <input type="text" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })}
                  placeholder="Например, 20 изделий разово или ежемесячные поставки" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
              </div>
              <div className="md:col-span-2">
                <label style={labelStyle}>КОММЕНТАРИЙ</label>
                <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  placeholder="Детали задачи, сроки, пожелания к дизайну..." rows={4}
                  className="w-full px-4 py-3 text-sm outline-none resize-none" style={inputStyle} />
              </div>
              <div className="md:col-span-2">
                <ConsentCheckbox checked={consent} onChange={setConsent} onOpenPolicy={() => setPage("privacy")} onLight />
              </div>
              {error && <p className="md:col-span-2" style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A" }}>{error}</p>}
              <div className="md:col-span-2">
                <button type="submit" disabled={loading} className="px-10 py-4 text-sm font-bold hover:brightness-125 active:scale-[0.98] transition-[filter,opacity,transform] duration-150 disabled:opacity-50"
                  style={{ backgroundColor: "#1A1412", color: CREAM, borderRadius: 12, fontFamily: JK }}>
                  {loading ? "Отправляем…" : "Отправить заявку"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FAQ Page ───────────────────────────────────────────────────────────────────
function FAQPage() {
  const [open, setOpen] = useState<number | null>(null);
  const faqs = [
    { q: "Насколько прочны изделия из PLA?", a: "PLA — биопластик на основе кукурузного крахмала. Достаточно прочен для декоративных объектов. Не рекомендуем оставлять на прямом солнце — деформируется при +60°C." },
    { q: "Можно ли использовать снаружи?", a: "Изделия из PLA — только для помещений. Для улицы есть PETG или ASA — напишите нам, обсудим." },
    { q: "Как ухаживать за изделием?", a: "Протирайте сухой или слегка влажной тканью. Не мойте в посудомойке, не замачивайте, не ставьте рядом с источниками тепла." },
    { q: "Видно ли слои от принтера?", a: "На готовых изделиях слои минимальны — слой 0,1–0,15мм + финишная обработка. Для полностью гладкой поверхности — смоляная печать или дополнительная шлифовка." },
    { q: "Как долго ждать заказ?", a: "В наличии — 1–3 дня. Под заказ — 7–14 дней. Кастомные изделия — 14–21 день." },
    { q: "Какие способы доставки?", a: "СДЭК, Почта России, самовывоз в Екатеринбурге. Тщательно упаковываем в фирменную коробку." },
  ];
  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-3xl">
        <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: MUTED_LIGHT, letterSpacing: "0.3em", marginBottom: 8 }}>— ВОПРОСЫ</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 34, color: "#1A1412", marginBottom: 36 }}>FAQ</h1>
        <div style={{ borderTop: `1px solid rgba(0,0,0,0.08)` }}>
          {faqs.map((f, i) => (
            <div key={i} style={{ borderBottom: `1px solid rgba(0,0,0,0.08)` }}>
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full text-left py-5 flex justify-between items-center gap-4">
                <span style={{ fontFamily: JK, fontWeight: 600, fontSize: 14, color: "#1A1412" }}>{f.q}</span>
                <ArrowRight size={14} style={{ color: MUTED_LIGHT, flexShrink: 0, transform: open === i ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {open === i && <p className="pb-5" style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.65 }}>{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Privacy Policy Page ──────────────────────────────────────────────────────
function DeliveryReturnsPage() {
  const sections = [
    {
      h: "Доставка",
      b: `Отправляем по всей России — СДЭК или Почта России, а также самовывоз в Екатеринбурге. Ozon Доставка подключим, как только будет одобрена заявка.
Сроки: изделия в наличии — 1–3 дня, под заказ — 7–14 дней, полностью кастомные изделия — 14–21 день. Стоимость доставки рассчитывается при оформлении заказа и зависит от региона и веса. Каждое изделие тщательно упаковывается в фирменную коробку с амортизирующим материалом.`,
    },
    {
      h: "Возврат и обмен",
      b: `В соответствии со ст. 26.1 Закона РФ «О защите прав потребителей» вы вправе отказаться от товара в любое время до его получения, а также в течение 7 дней после получения без объяснения причин — если сохранены его товарный вид и потребительские свойства.
Исключение: изделия, изготовленные по индивидуальному заказу (кастомные размеры, цвет, гравировка) — товары с индивидуально-определёнными свойствами, которые могут быть использованы исключительно приобретающим их лицом. Такие изделия возврату и обмену не подлежат, за исключением случая обнаружения производственного брака.
Чтобы оформить возврат, напишите нам в Telegram или ВКонтакте (контакты в подвале сайта) с номером заказа — согласуем детали и сроки возврата денежных средств (не позднее 10 дней с момента получения товара обратно).
При обнаружении брака или повреждения при транспортировке — свяжитесь с нами в течение 3 дней с момента получения, приложив фото; мы заменим изделие или вернём стоимость.`,
    },
    {
      h: "Уход за изделиями",
      b: `Протирайте изделия сухой или слегка влажной мягкой тканью. Не мойте в посудомоечной машине, не замачивайте в воде, не ставьте рядом с источниками тепла и не оставляйте под прямыми солнечными лучами — при нагреве свыше +60°C PLA-пластик может деформироваться.
Светильники: используйте лампы мощностью не выше указанной в характеристиках товара, отключайте от сети перед протиркой.`,
    },
  ];
  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-3xl">
        <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: MUTED_LIGHT, letterSpacing: "0.3em", marginBottom: 8 }}>— ИНФОРМАЦИЯ</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 34, color: "#1A1412", marginBottom: 36 }}>Доставка, возврат и уход</h1>
        <div className="space-y-10">
          {sections.map((s) => (
            <div key={s.h}>
              <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: "#1A1412", marginBottom: 10 }}>{s.h}</h2>
              <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.7, whiteSpace: "pre-line" }}>{s.b}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PrivacyPolicyPage() {
  const sections = [
    {
      h: "1. Общие положения",
      b: `Настоящая Политика обработки персональных данных (далее — «Политика») действует в отношении
всех данных, которые Белоглазова Светлана Андреевна, плательщик налога на профессиональный доход, ИНН 668400302968
(далее — «Оператор») может получить от посетителя сайта Satori в процессе оформления заказа,
обратной связи или использования сайта. Политика разработана в соответствии с Федеральным законом
от 27.07.2006 №152-ФЗ «О персональных данных».`,
    },
    {
      h: "2. Какие данные собираются",
      b: `Оператор обрабатывает: имя, номер телефона, адрес электронной почты, адрес доставки,
комментарий к заказу — те данные, которые пользователь указывает самостоятельно в формах
на сайте (оформление заказа, «На заказ», «Для бизнеса»).`,
    },
    {
      h: "3. Цели обработки",
      b: `Данные используются для оформления и доставки заказа, связи с покупателем по вопросам
заказа, информирования о статусе заказа и оплаты, а также для ответа на обращения через
формы обратной связи.`,
    },
    {
      h: "4. Правовое основание обработки",
      b: `Обработка осуществляется с согласия субъекта персональных данных, которое даётся при
отправке любой формы на сайте (отметка чекбокса согласия).`,
    },
    {
      h: "5. Передача третьим лицам",
      b: `Данные могут передаваться платёжному сервису (ЮKassa) для обработки оплаты и службам
доставки (СДЭК, Почта России, Ozon Доставка и др.) в объёме, необходимом для доставки
заказа. Данные не передаются третьим лицам в иных целях без отдельного согласия.`,
    },
    {
      h: "6. Срок хранения",
      b: `Данные хранятся не дольше, чем это необходимо для целей обработки, либо до отзыва
согласия субъектом персональных данных.`,
    },
    {
      h: "7. Права субъекта персональных данных",
      b: `Вы вправе запросить у Оператора информацию об обработке ваших данных, потребовать их
уточнения, блокирования или удаления, а также отозвать согласие на обработку — для этого
достаточно написать на ${EMAIL}.`,
    },
    {
      h: "8. Меры защиты",
      b: `Оператор принимает необходимые организационные и технические меры для защиты
персональных данных от неправомерного доступа, изменения, раскрытия или уничтожения.`,
    },
    {
      h: "9. Контакты",
      b: `По всем вопросам, связанным с обработкой персональных данных, обращайтесь: ${EMAIL},
${PHONE}.`,
    },
  ];
  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-3xl">
        <p style={{ fontFamily: LABEL, fontSize: 10, fontWeight: 600, color: MUTED_LIGHT, letterSpacing: "0.3em", marginBottom: 8 }}>— ДОКУМЕНТ</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 34, color: "#1A1412", marginBottom: 12 }}>Политика обработки персональных данных</h1>
        <p style={{ fontFamily: BODY, fontSize: 12, color: MUTED_LIGHT, marginBottom: 36 }}>Действует с 03.07.2026</p>
        <div className="space-y-8">
          {sections.map((s) => (
            <div key={s.h}>
              <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 15, color: "#1A1412", marginBottom: 8 }}>{s.h}</h2>
              <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, lineHeight: 1.7, whiteSpace: "pre-line" }}>{s.b}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────
// ── Иконки маркетплейсов (свои, в фирменных цветах платформ) ─────────────────
function OzonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="7" fill="#005BFF" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="#fff" strokeWidth="2.4" />
    </svg>
  );
}

function YandexMarketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="7" fill="#FC3F1D" />
      <path d="M8 9.2h8l-.7 8a1 1 0 0 1-1 .9H9.7a1 1 0 0 1-1-.9l-.7-8Z" fill="#fff" />
      <path d="M9.6 9V7.6a2.4 2.4 0 0 1 4.8 0V9" stroke="#fff" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function Footer({ setPage }: { setPage: (p: Page) => void }) {
  const [subEmail, setSubEmail] = useState("");
  const navCol = (title: string, items: { l: string; p: Page }[]) => (
    <div>
      <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED, letterSpacing: "0.15em", marginBottom: 18 }}>{title}</p>
      <div className="space-y-3">
        {items.map((it) => (
          <button key={it.l} onClick={() => setPage(it.p)} className="block transition-colors"
            style={{ fontFamily: BODY, fontSize: 13, color: MUTED }}>{it.l}</button>
        ))}
      </div>
    </div>
  );
  return (
    <footer className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-14" style={{ backgroundColor: "#0D0B08", borderTop: `1px solid ${CREAM}0c` }}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2.5 mb-4">
            <Logo height={28} />
          </div>
          <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.65, maxWidth: 220 }}>
            Предметы интерьера собственного производства. Создаём вещи, которые остаются надолго.
          </p>
        </div>
        {navCol("КАТАЛОГ", [
          { l: "Лампы", p: "catalog" }, { l: "Декор", p: "catalog" }, { l: "Украшения", p: "catalog" },
          { l: "Лимитированное", p: "limited" },
        ])}
        {navCol("КОМПАНИЯ", [
          { l: "О нас", p: "about" }, { l: "Доставка и оплата", p: "delivery" }, { l: "Бизнесу", p: "business" },
        ])}
        {navCol("ПОДДЕРЖКА", [
          { l: "Возврат и обмен", p: "delivery" }, { l: "Уход за изделиями", p: "delivery" }, { l: "FAQ", p: "faq" },
        ])}
        <div>
          <p style={{ fontFamily: LABEL, fontWeight: 600, fontSize: 10, color: MUTED, letterSpacing: "0.15em", marginBottom: 18 }}>БУДЬТЕ В КУРСЕ НОВИНОК</p>
          <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 14, maxWidth: 220 }}>
            Подпишитесь на рассылку и первыми узнавайте о новых коллекциях.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); toast.success("Спасибо! Вы подписаны на новости."); setSubEmail(""); }}
            className="flex items-center gap-2" style={{ borderBottom: `1px solid ${CREAM}30`, paddingBottom: 8 }}>
            <input type="email" required value={subEmail} onChange={(e) => setSubEmail(e.target.value)} placeholder="Ваш e-mail"
              className="bg-transparent outline-none flex-1 min-w-0" style={{ fontFamily: BODY, fontSize: 13, color: CREAM }} />
            <button type="submit" aria-label="Подписаться" style={{ color: CREAM }}><ArrowRight size={15} /></button>
          </form>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-10">
        {[
          { icon: <Send size={13} />, l: "Telegram", h: TELEGRAM_URL, goal: "telegram_click" },
          { icon: <MessageCircle size={13} />, l: "WhatsApp", h: WHATSAPP_URL, goal: "whatsapp_click" },
          { icon: <Users size={13} />, l: "ВКонтакте", h: VK_URL, goal: null },
          { icon: <Instagram size={13} />, l: "Instagram", h: INSTAGRAM_URL, goal: null },
          { icon: <MessageCircle size={13} />, l: EMAIL, h: `mailto:${EMAIL}`, goal: null },
          { icon: <Phone size={13} />, l: PHONE, h: `tel:${PHONE_HREF}`, goal: "phone_click" },
        ].map((c) => (
          <a key={c.l} href={c.h} target="_blank" rel="noopener noreferrer" aria-label={c.l}
            onClick={() => c.goal && (window as any).ym?.(110458266, "reachGoal", c.goal)}
            className="flex items-center gap-1.5 transition-colors" style={{ fontFamily: BODY, fontSize: 12, color: MUTED }}>
            <span style={{ color: CREAM }}>{c.icon}</span> {c.l}
          </a>
        ))}
      </div>
      <p style={{ fontFamily: BODY, fontSize: 11, color: MUTED, lineHeight: 1.5, marginBottom: 24, maxWidth: 480 }}>
        Сайт не загружается? Напишите в Telegram или ВКонтакте — они обычно остаются доступны даже при ограничениях мобильного интернета.
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        {[
          { icon: FUND_LOGO_URL ? <img loading="lazy" src={FUND_LOGO_URL} alt="" className="w-full h-full object-cover" /> : <Heart size={13} color="#E0567A" />, label: "Партнёр фонда «Братишка»" },
          { icon: <YandexMarketIcon />, label: "Продавец на Яндекс.Маркете" },
          { icon: <OzonIcon />, label: "Продавец на Ozon" },
        ].map((b) => (
          <div key={b.label} className="flex items-center gap-2 px-3.5 py-2"
            style={{ border: `1px solid ${CREAM}12`, borderRadius: 99, backgroundColor: `${CREAM}05` }}>
            <span className="flex items-center justify-center overflow-hidden shrink-0" style={{ width: 15, height: 15, borderRadius: 5 }}>{b.icon}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>{b.label}</span>
          </div>
        ))}
      </div>
      <p style={{ fontFamily: MONO, fontSize: 9, color: FAINT, lineHeight: 1.6, marginBottom: 20 }}>
        Продавец: Белоглазова Светлана Андреевна, плательщик налога на профессиональный доход (самозанятая), ИНН 668400302968.
      </p>
      <div className="flex flex-col md:flex-row justify-between items-center gap-3" style={{ borderTop: `1px solid ${CREAM}0c`, paddingTop: 28 }}>
        <p style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>© 2024 Сатори. Все права защищены.</p>
        <div className="flex gap-5">
          <button onClick={() => setPage("delivery")} className="transition-colors"
            style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>Доставка и возврат</button>
          <button onClick={() => setPage("privacy")} className="transition-colors"
            style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>Политика конфиденциальности</button>
          <button onClick={() => setPage("track")} className="transition-colors"
            style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>Отследить заказ</button>
          <a href="/admin" className="transition-colors"
            style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>Вход в админку</a>
        </div>
      </div>
    </footer>
  );
}

// ── Track Order Page ─────────────────────────────────────────────────────────
function TrackOrderPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [result, setResult] = useState<{ status: string; fulfillmentStatus: string; trackingCode?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/orders/track/${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Заказ не найден");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Заказ не найден");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const paymentBadge: Record<string, { l: string; c: string }> = {
    paid: { l: "Оплачен", c: "#4caf7d" },
    pending_payment: { l: "Ожидает оплаты", c: OG },
    canceled: { l: "Отменён", c: "#E05A5A" },
  };

  return (
    <div style={{ backgroundColor: LIGHT }} className="pt-24 min-h-screen px-6 md:px-14 pb-20">
      <div className="max-w-md mx-auto">
        <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 26, color: "#1A1412", marginBottom: 10 }}>Отследить заказ</h1>
        <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED_LIGHT, marginBottom: 24, lineHeight: 1.6 }}>
          Введите код заказа — он показывался на экране сразу после оплаты.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
          <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Например, a1b2c3d4"
            className="flex-1 px-4 py-3 text-sm outline-none"
            style={{ fontFamily: BODY, backgroundColor: "#fff", border: `1px solid rgba(0,0,0,0.12)`, borderRadius: 10, color: "#1A1412" }} />
          <button type="submit" disabled={loading}
            className="px-5 text-xs tracking-widest uppercase hover:brightness-125 active:scale-[0.98] transition-[filter,opacity,transform] duration-150 disabled:opacity-50"
            style={{ backgroundColor: "#1A1412", color: CREAM, borderRadius: 10, fontFamily: MONO }}>
            {loading ? "…" : "Проверить"}
          </button>
        </form>
        {error && <p style={{ fontFamily: BODY, fontSize: 13, color: "#E05A5A" }}>{error}</p>}
        {result && (
          <div className="p-5" style={{ backgroundColor: "#fff", borderRadius: 14, border: `1px solid rgba(0,0,0,0.1)` }}>
            <div className="flex justify-between mb-3">
              <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED_LIGHT }}>ОПЛАТА</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: paymentBadge[result.status]?.c ?? "#1A1412" }}>
                {paymentBadge[result.status]?.l ?? result.status}
              </span>
            </div>
            <div className="flex justify-between" style={{ marginBottom: result.trackingCode ? 12 : 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED_LIGHT }}>СТАТУС</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: "#1A1412" }}>{result.fulfillmentStatus}</span>
            </div>
            {result.trackingCode && (
              <div className="flex justify-between">
                <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED_LIGHT }}>ТРЕК-НОМЕР</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "#1A1412" }}>{result.trackingCode}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order Status Modal ───────────────────────────────────────────────────────
type OrderStatus = "checking" | "paid" | "pending_payment" | "canceled" | "error";

function OrderStatusModal({ status, orderId, onClose }: { status: OrderStatus; orderId?: string | null; onClose: () => void }) {
  const code = orderId?.slice(0, 8);
  const copy: Record<OrderStatus, { title: string; text: string; icon: React.ReactNode }> = {
    checking: { title: "Проверяем оплату…", text: "Обычно это занимает пару секунд.", icon: <RotateCw size={26} className="animate-spin" style={{ color: CREAM }} /> },
    paid: { title: "Заказ оплачен!", text: "Мы получили оплату и скоро свяжемся с вами по указанным контактам.", icon: <Check size={26} style={{ color: CREAM }} /> },
    pending_payment: { title: "Оплата ещё не подтверждена", text: "Если вы уже оплатили — подождите немного и обновите страницу.", icon: <Clock size={26} style={{ color: CREAM }} /> },
    canceled: { title: "Платёж отменён", text: "Заказ не был оплачен. Можете попробовать снова из корзины.", icon: <X size={26} style={{ color: "#E05A5A" }} /> },
    error: { title: "Не удалось проверить заказ", text: "Попробуйте обновить страницу или напишите нам в Telegram.", icon: <X size={26} style={{ color: "#E05A5A" }} /> },
  };
  const c = copy[status];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-sm p-8 text-center" style={{ backgroundColor: "#1A1612", borderRadius: 20, border: `1px solid ${CREAM}12` }}>
        <div className="mx-auto mb-5 w-14 h-14 flex items-center justify-center" style={{ backgroundColor: `${CREAM}15`, borderRadius: 99 }}>
          {c.icon}
        </div>
        <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: CREAM, marginBottom: 8 }}>{c.title}</h2>
        <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: status === "checking" ? 0 : (status === "paid" && code ? 14 : 24) }}>{c.text}</p>
        {status === "paid" && code && (
          <>
            <div className="mb-4 py-3 px-4 inline-block" style={{ backgroundColor: CARD, borderRadius: 10, border: `1px solid ${CREAM}12` }}>
              <p style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em", marginBottom: 4 }}>КОД ЗАКАЗА — СОХРАНИТЕ ДЛЯ ОТСЛЕЖИВАНИЯ</p>
              <p style={{ fontFamily: MONO, fontSize: 16, color: CREAM, fontWeight: 600 }}>{code}</p>
            </div>
            <p style={{ fontFamily: BODY, fontSize: 12, color: MUTED, lineHeight: 1.6, marginBottom: 20 }}>
              Напишите нам с этим кодом в{" "}
              <a href={VK_URL} target="_blank" rel="noopener noreferrer" style={{ color: CREAM, textDecoration: "underline" }}>ВКонтакте</a>{" "}
              — так вы будете получать статус заказа и трек-номер отправления.
            </p>
          </>
        )}
        {status !== "checking" && (
          <button onClick={onClose} className="w-full py-3 text-xs tracking-widest uppercase hover:brightness-125 active:scale-[0.98] transition-[filter,transform] duration-150"
            style={{ backgroundColor: CREAM, color: "#1A1412", borderRadius: 12, fontFamily: MONO }}>Понятно</button>
        )}
      </div>
    </div>
  );
}

// ── App Root ───────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [prevPage, setPrevPage] = useState<Page>("catalog");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [statusOrderId, setStatusOrderId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then((list: Product[]) => {
      setProducts(list);
      const pid = new URLSearchParams(window.location.search).get("p");
      if (pid) {
        const found = list.find((p) => String(p.id) === pid);
        if (found) { setSelectedProduct(found); setPage("product"); }
      }
    }).catch(() => setProducts([]));
    captureMetrikaIdentifiers();
  }, []);

  function navigate(p: Page) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (p !== "product" && window.location.search) window.history.replaceState({}, "", window.location.pathname);
    setPage(p);
  }

  // SPA pageviews: index.html's own `ym('init', ...)` call already sends the
  // first hit, so skip it here — only fire on subsequent in-app navigation.
  const isFirstPageRender = useRef(true);
  useEffect(() => {
    if (isFirstPageRender.current) { isFirstPageRender.current = false; return; }
    const virtualUrl = `${location.origin}/${page}${location.search}`;
    (window as any).ym?.(110458266, "hit", virtualUrl, { title: document.title, referer: document.referrer });
  }, [page]);
  function handleSelect(p: Product) {
    setSelectedProduct(p); setPrevPage(page);
    window.history.pushState({}, "", `?p=${p.id}`);
    navigate("product");
  }
  function handleAdd(p: Product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.product.id === p.id);
      return ex ? prev.map((i) => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i)
                : [...prev, { product: p, qty: 1 }];
    });
    pushEcommerce({
      currencyCode: "RUB",
      add: { products: [{ id: String(p.id), name: p.name, price: p.price, category: p.category, quantity: 1 }] },
    });
  }

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("orderId");
    if (!orderId) return;
    window.history.replaceState({}, "", window.location.pathname);
    setOrderStatus("checking");
    setStatusOrderId(orderId);

    let attempts = 0;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setOrderStatus("error"); return; }
        if (data.status === "paid") {
          setOrderStatus("paid"); setCart([]);
          const sentKey = `satori_purchase_sent_${orderId}`;
          if (!localStorage.getItem(sentKey)) {
            localStorage.setItem(sentKey, "1");
            (window as any).ym?.(110458266, "reachGoal", "purchase", { order_price: data.amount, currency: "RUB" });
            (window as any)._tmr?.push({ id: "3786706", type: "reachGoal", goal: "purchase", value: data.amount });
            pushEcommerce({
              currencyCode: "RUB",
              purchase: {
                actionField: { id: orderId, revenue: data.amount },
                products: (data.items || []).map((i: any) => ({
                  id: String(i.id ?? i.name), name: i.name, price: i.price, quantity: i.qty,
                })),
              },
            });
          }
          return;
        }
        if (data.status === "canceled") { setOrderStatus("canceled"); return; }
        attempts += 1;
        if (attempts >= 8) { setOrderStatus("pending_payment"); return; }
        setTimeout(poll, 1500);
      } catch {
        if (!cancelled) setOrderStatus("error");
      }
    }
    poll();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ backgroundColor: BG, fontFamily: BODY }}>
      <Toaster theme="dark" position="bottom-center" toastOptions={{
        style: { background: CARD, border: `1px solid ${CREAM}18`, color: CREAM, fontFamily: BODY },
      }} />
      <NavBar page={page} setPage={navigate} cartCount={cartCount} onCartOpen={() => setCartOpen(true)} />
      <div key={page} className="motion-safe:animate-[pageFade_280ms_ease-out]">
        {page === "home"    && <HomePage    products={products} setPage={navigate} onSelect={handleSelect} onAdd={handleAdd} />}
        {page === "catalog" && <CatalogPage products={products} onSelect={handleSelect} onAdd={handleAdd} setPage={setPage} />}
        {page === "limited" && <LimitedPage products={products} onSelect={handleSelect} onAdd={handleAdd} />}
        {page === "product" && selectedProduct &&
          <ProductPage product={selectedProduct} products={products} onBack={() => navigate(prevPage)} onAdd={handleAdd} onSelect={handleSelect} onCartOpen={() => setCartOpen(true)} />}
        {page === "about"   && <AboutPage />}
        {page === "custom"  && <CustomOrderPage setPage={navigate} />}
        {page === "business" && <BusinessPage setPage={navigate} />}
        {page === "faq"     && <FAQPage />}
        {page === "privacy" && <PrivacyPolicyPage />}
        {page === "track"   && <TrackOrderPage />}
        {page === "delivery" && <DeliveryReturnsPage />}
      </div>
      <Footer setPage={navigate} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={cart}
        onQtyChange={(id, d) => setCart((prev) => prev.map((i) => i.product.id === id ? { ...i, qty: i.qty + d } : i).filter((i) => i.qty > 0))}
        onRemove={(id) => setCart((prev) => prev.filter((i) => i.product.id !== id))} onNavigate={navigate} />
      <FloatingCTA />
      {orderStatus && <OrderStatusModal status={orderStatus} orderId={statusOrderId} onClose={() => setOrderStatus(null)} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Admin ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const ADMIN_TOKEN_KEY = "satori_admin_token";
const FULFILLMENT_STATUSES = ["Новый", "В работе", "Отправлен", "Выполнен", "Отменён"];

function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка входа");
      onLogin(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ backgroundColor: BG, fontFamily: BODY }} className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-8" style={{ backgroundColor: CARD, borderRadius: 20, border: `1px solid ${CREAM}12` }}>
        <div className="w-12 h-12 flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: `${OG}20`, borderRadius: 99, color: OG }}>
          <Lock size={20} />
        </div>
        <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 20, color: CREAM, textAlign: "center", marginBottom: 8 }}>Вход в админку</h1>
        <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, textAlign: "center", marginBottom: 24 }}>Satori — управление магазином</p>
        <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль" className="w-full px-4 py-3 text-sm outline-none mb-4"
          style={{ fontFamily: BODY, backgroundColor: BG, border: `1px solid ${CREAM}15`, borderRadius: 10, color: CREAM }} />
        {error && <p style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A", marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full py-3.5 text-white text-xs tracking-widest uppercase hover:brightness-110 active:scale-[0.98] transition-[filter,opacity,transform] duration-150 disabled:opacity-50"
          style={{ backgroundColor: OG, borderRadius: 12, fontFamily: MONO }}>
          {loading ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

function AdminProductForm({ initial, onSave, onCancel, onUpload }: {
  initial: Product | null; onSave: (data: Partial<Product>) => void; onCancel: () => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    nameEn: initial?.nameEn ?? "",
    category: initial?.category ?? "Декор",
    price: initial ? String(initial.price) : "",
    img: initial?.img ?? "",
    imgs: initial?.imgs?.join("\n") ?? "",
    badge: initial?.badge ?? "",
    inStock: initial?.inStock ?? true,
    lead: initial?.lead ?? "",
    material: initial?.material ?? "",
    dims: initial?.dims ?? "",
    weight: initial?.weight ?? "",
    description: initial?.description ?? "",
    watt: initial?.watt ?? "",
    limitedEdition: initial?.limitedEdition ?? false,
    editionNumber: initial?.editionNumber ? String(initial.editionNumber) : "",
    editionTotal: initial?.editionTotal ? String(initial.editionTotal) : "",
  });
  const [colorSwatches, setColorSwatches] = useState<{ color: string; img?: string }[]>(initial?.colorSwatches ?? []);
  const [newColor, setNewColor] = useState("#E07A34");
  const [colorUploading, setColorUploading] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newImgUrl, setNewImgUrl] = useState("");

  const imgList = form.imgs.split("\n").map((s) => s.trim()).filter(Boolean);
  function setImgList(list: string[]) {
    setForm((f) => ({ ...f, imgs: list.join("\n") }));
  }
  function removeImg(idx: number) {
    setImgList(imgList.filter((_, i) => i !== idx));
  }
  function addImgUrl() {
    const url = newImgUrl.trim();
    if (!url) return;
    setImgList([...imgList, url]);
    setNewImgUrl("");
  }

  function addColor() {
    setColorSwatches([...colorSwatches, { color: newColor }]);
  }
  function removeColor(idx: number) {
    setColorSwatches(colorSwatches.filter((_, i) => i !== idx));
  }
  function removeColorImg(idx: number) {
    setColorSwatches(colorSwatches.map((c, i) => (i === idx ? { ...c, img: undefined } : c)));
  }
  async function handleColorPhotoUpload(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setColorUploading(idx); setUploadError(null);
    try {
      const url = await onUpload(file);
      setColorSwatches((list) => list.map((c, i) => (i === idx ? { ...c, img: url } : c)));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setColorUploading(null);
    }
  }

  async function handleMainUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true); setUploadError(null);
    try {
      const url = await onUpload(file);
      setForm((f) => ({ ...f, img: url }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
    }
  }

  async function handleExtraUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setUploading(true); setUploadError(null);
    try {
      const urls = await Promise.all(files.map(onUpload));
      setForm((f) => ({ ...f, imgs: [f.imgs, ...urls].filter(Boolean).join("\n") }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const imgsArr = form.imgs.split("\n").map((s) => s.trim()).filter(Boolean);
    onSave({
      name: form.name, nameEn: form.nameEn, category: form.category,
      price: Number(form.price) || 0,
      img: form.img || imgsArr[0] || "",
      imgs: imgsArr.length ? imgsArr : (form.img ? [form.img] : []),
      badge: form.badge || undefined,
      inStock: form.inStock,
      lead: form.inStock ? undefined : (form.lead || undefined),
      material: form.material || undefined,
      dims: form.dims || undefined,
      weight: form.weight || undefined,
      description: form.description || undefined,
      watt: form.watt || undefined,
      colors: colorSwatches.length || undefined,
      colorSwatches: colorSwatches.length ? colorSwatches : undefined,
      limitedEdition: form.limitedEdition,
      editionNumber: form.limitedEdition ? (Number(form.editionNumber) || undefined) : undefined,
      editionTotal: form.limitedEdition ? (Number(form.editionTotal) || undefined) : undefined,
    });
  }

  const inputStyle = { fontFamily: BODY, backgroundColor: BG, border: `1px solid ${CREAM}15`, borderRadius: 10, color: CREAM } as const;
  const labelStyle = { fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em", display: "block", marginBottom: 6 } as const;

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      <div>
        <label style={labelStyle}>НАЗВАНИЕ</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>АНГЛИЙСКОЕ НАЗВАНИЕ</label>
        <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>КАТЕГОРИЯ</label>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none cursor-pointer" style={inputStyle}>
          {CATEGORIES.map((c) => <option key={c} style={{ background: BG }}>{c}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>ЦЕНА, ₽</label>
        <input required type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div className="md:col-span-2">
        <label style={labelStyle}>ГЛАВНОЕ ФОТО</label>
        <div className="flex gap-3 items-start">
          {form.img && (
            <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", backgroundColor: BG, flexShrink: 0 }}>
              <Picture src={form.img} w={52} h={52} alt="" loading="lazy" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <input required value={form.img} onChange={(e) => setForm({ ...form, img: e.target.value })}
              placeholder="https://... или загрузите файл" className="w-full px-3.5 py-2.5 text-sm outline-none mb-2" style={inputStyle} />
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs cursor-pointer transition-colors"
              style={{ border: `1px solid ${CREAM}18`, borderRadius: 8, fontFamily: MONO, color: MUTED }}>
              <Upload size={13} /> {uploading ? "Загрузка…" : "Загрузить с компьютера"}
              <input type="file" accept="image/*" onChange={handleMainUpload} disabled={uploading} className="hidden" />
            </label>
          </div>
        </div>
      </div>
      <div className="md:col-span-2">
        <label style={labelStyle}>ДОПОЛНИТЕЛЬНЫЕ ФОТО</label>
        {imgList.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {imgList.map((url, i) => (
              <div key={i} className="relative" style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", backgroundColor: BG, flexShrink: 0 }}>
                <Picture loading="lazy" src={url} w={64} h={64} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => removeImg(i)}
                  className="absolute top-1 right-1 flex items-center justify-center"
                  style={{ width: 18, height: 18, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.65)" }}>
                  <X size={11} color="#fff" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mb-2">
          <input value={newImgUrl} onChange={(e) => setNewImgUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImgUrl(); } }}
            placeholder="https://... и нажмите «Добавить»" className="flex-1 px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
          <button type="button" onClick={addImgUrl}
            className="px-3.5 text-xs shrink-0" style={{ border: `1px solid ${CREAM}18`, borderRadius: 8, fontFamily: MONO, color: MUTED }}>
            Добавить
          </button>
        </div>
        <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs cursor-pointer transition-colors"
          style={{ border: `1px solid ${CREAM}18`, borderRadius: 8, fontFamily: MONO, color: MUTED }}>
          <Upload size={13} /> {uploading ? "Загрузка…" : "Добавить фото с компьютера"}
          <input type="file" accept="image/*" multiple onChange={handleExtraUpload} disabled={uploading} className="hidden" />
        </label>
        {uploadError && <p style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A", marginTop: 8 }}>{uploadError}</p>}
      </div>
      <div>
        <label style={labelStyle}>БЕЙДЖ</label>
        <select value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none cursor-pointer" style={inputStyle}>
          <option value="" style={{ background: BG }}>Нет</option>
          {["Хит", "Новинка", "Лимит"].map((b) => <option key={b} style={{ background: BG }}>{b}</option>)}
        </select>
      </div>
      <div className="md:col-span-2 p-3.5" style={{ border: `1px solid ${form.limitedEdition ? OG : `${CREAM}15`}`, borderRadius: 10, transition: "border-color 0.2s" }}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setForm({ ...form, limitedEdition: !form.limitedEdition })}
            className="relative shrink-0" style={{ width: 34, height: 18, backgroundColor: form.limitedEdition ? OG : `${CREAM}18`, borderRadius: 99, transition: "background-color 0.2s" }}>
            <div style={{ position: "absolute", top: 2, width: 14, height: 14, backgroundColor: BG, borderRadius: 99, transition: "transform 0.2s", transform: form.limitedEdition ? "translateX(18px)" : "translateX(2px)" }} />
          </button>
          <span style={{ fontFamily: BODY, fontSize: 13, color: CREAM }}>Лимитированная серия — товар попадёт в раздел «Лимит. серия»</span>
        </div>
        {form.limitedEdition && (
          <div className="grid grid-cols-2 gap-3 mt-3.5">
            <div>
              <label style={labelStyle}>НОМЕР ЭКЗЕМПЛЯРА</label>
              <input type="number" min={1} value={form.editionNumber} onChange={(e) => setForm({ ...form, editionNumber: e.target.value })}
                placeholder="напр. 1" className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>ВСЕГО В СЕРИИ</label>
              <input type="number" min={1} value={form.editionTotal} onChange={(e) => setForm({ ...form, editionTotal: e.target.value })}
                placeholder="напр. 12" className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
        )}
      </div>
      <div className="md:col-span-2">
        <label style={labelStyle}>ЦВЕТА ({colorSwatches.length}) — можно прикрепить фото товара в этом цвете</label>
        <div className="flex flex-wrap items-start gap-3 mb-2">
          {colorSwatches.map((c, i) => (
            <div key={i} className="relative flex flex-col items-center gap-1.5">
              <button type="button" onClick={() => removeColor(i)}
                className="absolute -top-1.5 -right-1.5 z-10 flex items-center justify-center"
                style={{ width: 16, height: 16, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.75)" }}>
                <X size={9} color="#fff" />
              </button>
              <div style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: c.color, border: `1px solid ${CREAM}20` }} />
              {c.img ? (
                <div className="relative overflow-hidden" style={{ width: 56, height: 56, borderRadius: 8 }}>
                  <Picture src={c.img} w={56} h={56} alt="" loading="lazy" className="w-full h-full object-cover" style={{ backgroundColor: BG }} />
                  <button type="button" onClick={() => removeColorImg(i)}
                    className="absolute top-1 right-1 flex items-center justify-center"
                    style={{ width: 15, height: 15, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.65)" }}>
                    <X size={8} color="#fff" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center cursor-pointer" style={{ width: 56, height: 56, borderRadius: 8, border: `1px dashed ${CREAM}30` }}>
                  {colorUploading === i ? (
                    <span style={{ fontFamily: MONO, fontSize: 8, color: MUTED }}>…</span>
                  ) : (
                    <Upload size={13} style={{ color: MUTED }} />
                  )}
                  <input type="file" accept="image/*" className="hidden" disabled={colorUploading === i}
                    onChange={(e) => handleColorPhotoUpload(i, e)} />
                </label>
              )}
            </div>
          ))}
          <div className="flex flex-col items-center gap-1.5">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
              className="cursor-pointer" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${CREAM}20`, backgroundColor: "transparent", padding: 0 }} />
            <button type="button" onClick={addColor}
              className="flex items-center justify-center text-xs text-center px-1" style={{ width: 56, height: 56, borderRadius: 8, border: `1px solid ${CREAM}18`, fontFamily: MONO, color: MUTED, lineHeight: 1.3 }}>
              + Добавить цвет
            </button>
          </div>
        </div>
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <button type="button" onClick={() => setForm({ ...form, inStock: !form.inStock })}
          className="relative shrink-0" style={{ width: 34, height: 18, backgroundColor: form.inStock ? OG : `${CREAM}18`, borderRadius: 99, transition: "background-color 0.2s" }}>
          <div style={{ position: "absolute", top: 2, width: 14, height: 14, backgroundColor: BG, borderRadius: 99, transition: "transform 0.2s", transform: form.inStock ? "translateX(18px)" : "translateX(2px)" }} />
        </button>
        <span style={{ fontFamily: BODY, fontSize: 13, color: CREAM }}>В наличии</span>
        {!form.inStock && (
          <input value={form.lead} onChange={(e) => setForm({ ...form, lead: e.target.value })}
            placeholder="Срок, напр. 14 дней" className="flex-1 px-3.5 py-2 text-sm outline-none" style={inputStyle} />
        )}
      </div>
      <div>
        <label style={labelStyle}>МАТЕРИАЛ</label>
        <input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>РАЗМЕРЫ</label>
        <input value={form.dims} onChange={(e) => setForm({ ...form, dims: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>ВЕС</label>
        <input value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>МОЩНОСТЬ (для ламп)</label>
        <input value={form.watt} onChange={(e) => setForm({ ...form, watt: e.target.value })}
          placeholder="напр. 40W" className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
      </div>
      <div className="md:col-span-2">
        <label style={labelStyle}>ОПИСАНИЕ</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
          className="w-full px-3.5 py-2.5 text-sm outline-none resize-none" style={inputStyle} />
      </div>
      <div className="md:col-span-2 flex gap-3 pt-2">
        <button type="submit" className="flex-1 md:flex-none text-white px-8 py-3 text-sm font-bold hover:brightness-110 active:scale-95 transition-[filter,transform] duration-150"
          style={{ backgroundColor: OG, borderRadius: 10, fontFamily: JK }}>
          Сохранить
        </button>
        <button type="button" onClick={onCancel} className="flex-1 md:flex-none px-8 py-3 text-sm font-semibold transition-colors"
          style={{ border: `1px solid ${CREAM}18`, borderRadius: 10, fontFamily: JK, color: MUTED }}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<"products" | "orders" | "leads" | "gallery" | "hero" | "promocodes">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [gallery, setGallery] = useState<{ id: string; url: string }[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [hero, setHero] = useState<{ type: "image" | "video" | null; url: string | null }>({ type: null, url: null });
  const [heroUploading, setHeroUploading] = useState(false);
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [promoForm, setPromoForm] = useState({ code: "", type: "percent", value: "", usageLimit: "" });
  const [promoError, setPromoError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  function handleAuthFail(res: Response) {
    if (res.status === 401) { onLogout(); return true; }
    return false;
  }

  async function loadProducts() {
    const res = await fetch("/api/products");
    setProducts(await res.json());
  }
  async function loadOrders() {
    const res = await fetch("/api/admin/orders", { headers: authHeaders });
    if (handleAuthFail(res)) return;
    setOrders(await res.json());
  }
  async function loadGallery() {
    const res = await fetch("/api/gallery");
    setGallery(await res.json());
  }
  async function loadHero() {
    const res = await fetch("/api/hero");
    setHero(await res.json());
  }
  async function loadLeads() {
    const res = await fetch("/api/admin/leads", { headers: authHeaders });
    if (handleAuthFail(res)) return;
    setLeads(await res.json());
  }
  async function loadPromoCodes() {
    const res = await fetch("/api/admin/promocodes", { headers: authHeaders });
    if (handleAuthFail(res)) return;
    setPromoCodes(await res.json());
  }

  async function handleDeleteLead(id: string) {
    if (!confirm("Удалить заявку?")) return;
    const res = await fetch(`/api/admin/leads/${id}`, { method: "DELETE", headers: authHeaders });
    if (handleAuthFail(res)) return;
    await loadLeads();
  }

  async function handleOpenLeadsTab() {
    setTab("leads");
    if (leads.some((l) => !l.read)) {
      setLeads((prev) => prev.map((l) => ({ ...l, read: true })));
      const res = await fetch("/api/admin/leads/read-all", { method: "POST", headers: authHeaders });
      handleAuthFail(res);
    }
  }

  useEffect(() => {
    Promise.all([loadProducts(), loadOrders(), loadLeads(), loadGallery(), loadHero(), loadPromoCodes()]).catch(() => setError("Не удалось загрузить данные")).finally(() => setLoading(false));
  }, []);

  async function handleCreatePromoCode(e: React.FormEvent) {
    e.preventDefault();
    setPromoError(null);
    const res = await fetch("/api/admin/promocodes", {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({
        code: promoForm.code, type: promoForm.type, value: Number(promoForm.value),
        usageLimit: promoForm.usageLimit ? Number(promoForm.usageLimit) : undefined,
      }),
    });
    if (handleAuthFail(res)) return;
    const data = await res.json();
    if (!res.ok) { setPromoError(data.error || "Не удалось создать промокод"); return; }
    setPromoForm({ code: "", type: "percent", value: "", usageLimit: "" });
    await loadPromoCodes();
  }

  async function handleTogglePromo(code: string, active: boolean) {
    const res = await fetch(`/api/admin/promocodes/${code}`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ active }) });
    if (handleAuthFail(res)) return;
    await loadPromoCodes();
  }

  async function handleDeletePromo(code: string) {
    if (!confirm(`Удалить промокод ${code}?`)) return;
    const res = await fetch(`/api/admin/promocodes/${code}`, { method: "DELETE", headers: authHeaders });
    if (handleAuthFail(res)) return;
    await loadPromoCodes();
  }

  async function handleSave(data: Partial<Product>) {
    const isNew = editing === "new";
    const url = isNew ? "/api/admin/products" : `/api/admin/products/${(editing as Product).id}`;
    const res = await fetch(url, { method: isNew ? "POST" : "PUT", headers: authHeaders, body: JSON.stringify(data) });
    if (handleAuthFail(res)) return;
    if (!res.ok) { setError("Не удалось сохранить товар"); return; }
    setEditing(null);
    setError(null);
    await loadProducts();
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить товар безвозвратно?")) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE", headers: authHeaders });
    if (handleAuthFail(res)) return;
    await loadProducts();
  }

  async function handleUpload(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("photo", file);
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (handleAuthFail(res)) throw new Error("Не авторизован");
    if (!res.ok) throw new Error(data.error || "Не удалось загрузить фото");
    return data.url;
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setGalleryUploading(true); setError(null);
    try {
      for (const file of files) {
        const url = await handleUpload(file);
        const res = await fetch("/api/admin/gallery", { method: "POST", headers: authHeaders, body: JSON.stringify({ url }) });
        if (handleAuthFail(res)) return;
      }
      await loadGallery();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setGalleryUploading(false);
    }
  }

  async function handleGalleryDelete(id: string) {
    const res = await fetch(`/api/admin/gallery/${id}`, { method: "DELETE", headers: authHeaders });
    if (handleAuthFail(res)) return;
    await loadGallery();
  }

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setHeroUploading(true); setError(null);
    try {
      const url = await handleUpload(file);
      const type = file.type.startsWith("video/") ? "video" : "image";
      const res = await fetch("/api/admin/hero", { method: "PUT", headers: authHeaders, body: JSON.stringify({ type, url }) });
      if (handleAuthFail(res)) return;
      await loadHero();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setHeroUploading(false);
    }
  }

  async function handleHeroRemove() {
    if (!confirm("Убрать фото/видео с главного экрана?")) return;
    const res = await fetch("/api/admin/hero", { method: "PUT", headers: authHeaders, body: JSON.stringify({ type: null, url: null }) });
    if (handleAuthFail(res)) return;
    await loadHero();
  }

  async function handleStatusChange(id: string, fulfillmentStatus: string) {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, fulfillmentStatus } : o));
    const res = await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ fulfillmentStatus }) });
    if (handleAuthFail(res)) return;
  }

  function setTrackingCodeLocal(id: string, trackingCode: string) {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, trackingCode } : o));
  }
  async function commitTrackingCode(id: string, trackingCode: string) {
    const res = await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ trackingCode }) });
    if (handleAuthFail(res)) return;
  }

  const paymentBadge: Record<string, { l: string; c: string }> = {
    paid: { l: "Оплачен", c: "#4caf7d" },
    pending_payment: { l: "Ожидает оплаты", c: `${CREAM}70` },
    canceled: { l: "Отменён", c: "#E05A5A" },
  };

  return (
    <div style={{ backgroundColor: BG, fontFamily: BODY }} className="min-h-screen">
      <header className="flex items-center justify-between px-4 md:px-10 h-16" style={{ borderBottom: `1px solid ${CREAM}0c` }}>
        <div className="flex items-center gap-3">
          <Logo height={28} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: "0.15em" }}>АДМИНКА</span>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 transition-colors" style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>
          <LogOut size={14} /> Выйти
        </button>
      </header>

      <div className="px-4 md:px-10 pt-6">
        <div className="flex gap-2 mb-8 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setTab("products")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors shrink-0 whitespace-nowrap"
            style={{ fontFamily: JK, fontWeight: 600, borderRadius: 10, backgroundColor: tab === "products" ? OG : `${CREAM}08`, color: tab === "products" ? "#fff" : `${CREAM}70` }}>
            <PackageSearch size={15} /> Товары
          </button>
          <button onClick={() => setTab("orders")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors shrink-0 whitespace-nowrap"
            style={{ fontFamily: JK, fontWeight: 600, borderRadius: 10, backgroundColor: tab === "orders" ? OG : `${CREAM}08`, color: tab === "orders" ? "#fff" : `${CREAM}70` }}>
            <ClipboardList size={15} /> Заказы
            {orders.filter((o) => o.fulfillmentStatus === "Новый").length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: "#E05A5A", borderRadius: 99 }}>
                {orders.filter((o) => o.fulfillmentStatus === "Новый").length}
              </span>
            )}
          </button>
          <button onClick={handleOpenLeadsTab}
            className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors shrink-0 whitespace-nowrap"
            style={{ fontFamily: JK, fontWeight: 600, borderRadius: 10, backgroundColor: tab === "leads" ? OG : `${CREAM}08`, color: tab === "leads" ? "#fff" : `${CREAM}70` }}>
            <Inbox size={15} /> Заявки
            {leads.filter((l) => !l.read).length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: "#E05A5A", borderRadius: 99 }}>
                {leads.filter((l) => !l.read).length}
              </span>
            )}
          </button>
          <button onClick={() => setTab("gallery")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors shrink-0 whitespace-nowrap"
            style={{ fontFamily: JK, fontWeight: 600, borderRadius: 10, backgroundColor: tab === "gallery" ? OG : `${CREAM}08`, color: tab === "gallery" ? "#fff" : `${CREAM}70` }}>
            <Sparkles size={15} /> Галерея
          </button>
          <button onClick={() => setTab("hero")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors shrink-0 whitespace-nowrap"
            style={{ fontFamily: JK, fontWeight: 600, borderRadius: 10, backgroundColor: tab === "hero" ? OG : `${CREAM}08`, color: tab === "hero" ? "#fff" : `${CREAM}70` }}>
            <Film size={15} /> Хиро
          </button>
          <button onClick={() => setTab("promocodes")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors shrink-0 whitespace-nowrap"
            style={{ fontFamily: JK, fontWeight: 600, borderRadius: 10, backgroundColor: tab === "promocodes" ? OG : `${CREAM}08`, color: tab === "promocodes" ? "#fff" : `${CREAM}70` }}>
            <Tag size={15} /> Промокоды
          </button>
        </div>

        {loading ? (
          <p style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>Загрузка…</p>
        ) : (
          <>
            {error && <p className="mb-4" style={{ fontFamily: BODY, fontSize: 13, color: "#E05A5A" }}>{error}</p>}

            {tab === "products" && (
              <div className="pb-16">
                {editing ? (
                  <div className="max-w-3xl p-4 md:p-6 mb-8" style={{ backgroundColor: CARD, borderRadius: 16, border: `1px solid ${CREAM}08` }}>
                    <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 16, color: CREAM, marginBottom: 20 }}>
                      {editing === "new" ? "Новый товар" : `Редактирование: ${editing.name}`}
                    </h2>
                    <AdminProductForm initial={editing === "new" ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} onUpload={handleUpload} />
                  </div>
                ) : (
                  <button onClick={() => setEditing("new")}
                    className="flex items-center justify-center gap-2 mb-6 px-5 py-3 w-full md:w-auto text-white text-sm font-bold hover:brightness-110 active:scale-95 transition-[filter,transform] duration-150"
                    style={{ backgroundColor: OG, borderRadius: 10, fontFamily: JK }}>
                    <Plus size={16} /> Добавить товар
                  </button>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${CREAM}0c` }}>
                        {["Фото", "Название", "Категория", "Цена", "Наличие", "Серия", ""].map((h) => (
                          <th key={h} className="text-left py-3 px-3" style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id} style={{ borderBottom: `1px solid ${CREAM}08` }}>
                          <td className="py-2.5 px-3">
                            <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", backgroundColor: CARD }}>
                              <Picture src={p.img} w={44} h={44} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                            </div>
                          </td>
                          <td className="py-2.5 px-3" style={{ fontFamily: BODY, fontSize: 13, color: CREAM, whiteSpace: "nowrap" }}>{p.name}</td>
                          <td className="py-2.5 px-3" style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{p.category}</td>
                          <td className="py-2.5 px-3" style={{ fontFamily: MONO, fontSize: 12, color: OG, whiteSpace: "nowrap" }}>{fmt(p.price)}</td>
                          <td className="py-2.5 px-3" style={{ fontFamily: MONO, fontSize: 10, color: p.inStock ? "#4caf7d" : `${CREAM}40`, whiteSpace: "nowrap" }}>
                            {p.inStock ? "В наличии" : "Под заказ"}
                          </td>
                          <td className="py-2.5 px-3" style={{ fontFamily: MONO, fontSize: 11, color: p.limitedEdition ? OG : `${CREAM}30`, whiteSpace: "nowrap" }}>
                            {p.limitedEdition ? `№${p.editionNumber ?? "?"}/${p.editionTotal ?? "?"}` : "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditing(p)} style={{ color: MUTED }}><Pencil size={15} /></button>
                              <button onClick={() => handleDelete(p.id)} style={{ color: "#E05A5A" }}><Trash2 size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {products.length === 0 && <p className="py-10 text-center" style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>Товаров пока нет</p>}
                </div>
              </div>
            )}

            {tab === "orders" && (
              <div className="pb-16 overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CREAM}0c` }}>
                      {["Дата", "Клиент", "Товары", "Доставка", "Сумма", "Оплата", "Статус"].map((h) => (
                        <th key={h} className="text-left py-3 px-3" style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} style={{ borderBottom: `1px solid ${CREAM}08` }}>
                        <td className="py-3 px-3" style={{ fontFamily: MONO, fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>
                          {new Date(o.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 13, color: CREAM, whiteSpace: "nowrap" }}>
                          <div>{o.customer?.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>{o.customer?.phone}</div>
                          {o.customer?.contactMethod && o.customer.contactMethod !== "Телефон" && (
                            <div style={{ fontFamily: MONO, fontSize: 10, color: OG }}>
                              {o.customer.contactMethod}{o.customer?.contactHandle ? `: ${o.customer.contactHandle}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 12, color: MUTED, maxWidth: 220 }}>
                          {o.items?.map((i: any) => `${i.name} ×${i.qty}`).join(", ")}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>
                          <div>{o.customer?.delivery ?? "—"}</div>
                          {(o.customer?.address || o.customer?.apartment || o.customer?.postalCode) && (
                            <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, maxWidth: 180, whiteSpace: "normal" }}>
                              {[o.customer?.address, o.customer?.apartment && `кв./оф. ${o.customer.apartment}`, o.customer?.postalCode]
                                .filter(Boolean).join(", ")}
                            </div>
                          )}
                          {o.customer?.comment && (
                            <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, maxWidth: 180, whiteSpace: "normal" }}>{o.customer.comment}</div>
                          )}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: MONO, fontSize: 12, color: OG, whiteSpace: "nowrap" }}>
                          {fmt(o.amount)}
                          {o.promoCode && (
                            <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED }}>
                              {o.promoCode} (−{fmt(o.discount)})
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3" style={{ whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: paymentBadge[o.status]?.c ?? `${CREAM}55` }}>
                            {paymentBadge[o.status]?.l ?? o.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <select value={o.fulfillmentStatus ?? "Новый"} onChange={(e) => handleStatusChange(o.id, e.target.value)}
                            className="px-2.5 py-1.5 text-xs outline-none cursor-pointer mb-1.5"
                            style={{ fontFamily: MONO, backgroundColor: CARD, border: `1px solid ${CREAM}15`, borderRadius: 8, color: CREAM }}>
                            {FULFILLMENT_STATUSES.map((s) => <option key={s} value={s} style={{ background: BG }}>{s}</option>)}
                          </select>
                          {o.fulfillmentStatus === "Отправлен" && (
                            <input value={o.trackingCode ?? ""} placeholder="Трек-номер"
                              onChange={(e) => setTrackingCodeLocal(o.id, e.target.value)}
                              onBlur={(e) => commitTrackingCode(o.id, e.target.value)}
                              className="px-2.5 py-1.5 text-xs outline-none block w-full"
                              style={{ fontFamily: MONO, backgroundColor: CARD, border: `1px solid ${CREAM}15`, borderRadius: 8, color: CREAM }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && <p className="py-10 text-center" style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>Заказов пока нет</p>}
              </div>
            )}

            {tab === "leads" && (
              <div className="pb-16 overflow-x-auto">
                <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, marginBottom: 16, maxWidth: 560 }}>
                  Заявки с форм «На заказ» и «Бизнесу». Свяжитесь с клиентом по указанному контакту, затем удалите заявку.
                </p>
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CREAM}0c` }}>
                      {["Дата", "Тип", "Контакт", "Детали", ""].map((h) => (
                        <th key={h} className="text-left py-3 px-3" style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id} style={{ borderBottom: `1px solid ${CREAM}08` }}>
                        <td className="py-3 px-3" style={{ fontFamily: MONO, fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>
                          {new Date(l.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: MONO, fontSize: 10, color: l.type === "business" ? OG : "#4caf7d", whiteSpace: "nowrap" }}>
                          {l.type === "business" ? "Бизнесу" : "На заказ"}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 13, color: CREAM, whiteSpace: "nowrap" }}>
                          <div>{l.type === "business" ? `${l.company} — ${l.name}` : l.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>
                            {[l.phone, l.email, l.contact].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 12, color: MUTED, maxWidth: 320, whiteSpace: "normal" }}>
                          {l.type === "business"
                            ? [l.inquiryType, l.volume && `объём: ${l.volume}`, l.comment].filter(Boolean).join(" · ")
                            : [l.budget && `бюджет: ${l.budget}`, l.idea].filter(Boolean).join(" · ")}
                        </td>
                        <td className="py-3 px-3">
                          <button onClick={() => handleDeleteLead(l.id)} style={{ color: "#E05A5A" }}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {leads.length === 0 && <p className="py-10 text-center" style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>Заявок пока нет</p>}
              </div>
            )}

            {tab === "gallery" && (
              <div className="pb-16">
                <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, marginBottom: 16, maxWidth: 480 }}>
                  Эти фото показываются в разделе «Галерея» на главной странице сайта.
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors mb-6"
                  style={{ border: `1px solid ${CREAM}18`, borderRadius: 10, fontFamily: MONO, color: MUTED }}>
                  <Upload size={14} /> {galleryUploading ? "Загрузка…" : "Добавить фото"}
                  <input type="file" accept="image/*" multiple onChange={handleGalleryUpload} disabled={galleryUploading} className="hidden" />
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {gallery.map((p) => (
                    <div key={p.id} className="relative group" style={{ aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", backgroundColor: CARD }}>
                      <Picture loading="lazy" src={p.url} w={320} h={320} alt="" sizes="(max-width: 767px) 50vw, 16vw" className="w-full h-full object-cover" />
                      <button onClick={() => handleGalleryDelete(p.id)}
                        className="absolute top-1.5 right-1.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ width: 24, height: 24, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.75)" }}>
                        <Trash2 size={12} color="#fff" />
                      </button>
                    </div>
                  ))}
                </div>
                {gallery.length === 0 && <p className="py-10 text-center" style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>Фото пока нет</p>}
              </div>
            )}

            {tab === "hero" && (
              <div className="pb-16">
                <p style={{ fontFamily: BODY, fontSize: 13, color: MUTED, marginBottom: 16, maxWidth: 480 }}>
                  Фото или видео, которое показывается фоном на главном экране сайта вместо текущего.
                  Видео проигрывается без звука и зацикленно. Максимальный размер файла — 60 МБ.
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors mb-6"
                  style={{ border: `1px solid ${CREAM}18`, borderRadius: 10, fontFamily: MONO, color: MUTED }}>
                  <Upload size={14} /> {heroUploading ? "Загрузка…" : hero.url ? "Заменить файл" : "Загрузить фото/видео"}
                  <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={handleHeroUpload} disabled={heroUploading} className="hidden" />
                </label>
                {hero.url ? (
                  <div style={{ maxWidth: 420 }}>
                    <div className="relative" style={{ aspectRatio: "16/10", borderRadius: 14, overflow: "hidden", backgroundColor: CARD }}>
                      {hero.type === "video" ? (
                        <video src={hero.url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                      ) : (
                        <Picture src={hero.url} w={640} h={400} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <button onClick={handleHeroRemove} className="flex items-center gap-2 mt-4 px-4 py-2 text-sm transition-colors"
                      style={{ fontFamily: MONO, color: "#E05A5A", border: "1px solid #E05A5A40", borderRadius: 10, backgroundColor: "transparent" }}>
                      <Trash2 size={14} /> Убрать
                    </button>
                  </div>
                ) : (
                  <p className="py-10 text-center" style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>Файл не загружен — на главной показывается стандартный фон</p>
                )}
              </div>
            )}

            {tab === "promocodes" && (
              <div className="pb-16">
                <form onSubmit={handleCreatePromoCode} className="flex flex-wrap items-end gap-3 mb-8 p-4"
                  style={{ backgroundColor: CARD, borderRadius: 12, border: `1px solid ${CREAM}0e` }}>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>КОД</label>
                    <input required value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                      placeholder="SATORI10" className="px-3 py-2 text-sm outline-none w-36"
                      style={{ fontFamily: MONO, backgroundColor: BG, border: `1px solid ${CREAM}18`, borderRadius: 8, color: CREAM }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>ТИП</label>
                    <select value={promoForm.type} onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })}
                      className="px-3 py-2 text-sm outline-none cursor-pointer"
                      style={{ fontFamily: MONO, backgroundColor: BG, border: `1px solid ${CREAM}18`, borderRadius: 8, color: CREAM }}>
                      <option value="percent" style={{ background: BG }}>% от суммы</option>
                      <option value="fixed" style={{ background: BG }}>Фикс. сумма ₽</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                      {promoForm.type === "percent" ? "СКИДКА, %" : "СКИДКА, ₽"}
                    </label>
                    <input required type="number" min={1} value={promoForm.value} onChange={(e) => setPromoForm({ ...promoForm, value: e.target.value })}
                      placeholder={promoForm.type === "percent" ? "10" : "500"} className="px-3 py-2 text-sm outline-none w-24"
                      style={{ fontFamily: MONO, backgroundColor: BG, border: `1px solid ${CREAM}18`, borderRadius: 8, color: CREAM }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>ЛИМИТ ИСПОЛЬЗ. (необяз.)</label>
                    <input type="number" min={1} value={promoForm.usageLimit} onChange={(e) => setPromoForm({ ...promoForm, usageLimit: e.target.value })}
                      placeholder="∞" className="px-3 py-2 text-sm outline-none w-24"
                      style={{ fontFamily: MONO, backgroundColor: BG, border: `1px solid ${CREAM}18`, borderRadius: 8, color: CREAM }} />
                  </div>
                  <button type="submit"
                    className="px-5 py-2.5 text-sm text-white hover:brightness-110 active:scale-95 transition-[filter,transform] duration-150"
                    style={{ fontFamily: JK, fontWeight: 600, backgroundColor: OG, borderRadius: 8 }}>
                    + Создать
                  </button>
                  {promoError && <p className="w-full" style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A" }}>{promoError}</p>}
                </form>

                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CREAM}0c` }}>
                      {["Код", "Скидка", "Использовано", "Статус", ""].map((h) => (
                        <th key={h} className="text-left py-3 px-3" style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.1em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {promoCodes.map((p) => (
                      <tr key={p.code} style={{ borderBottom: `1px solid ${CREAM}08` }}>
                        <td className="py-3 px-3" style={{ fontFamily: MONO, fontSize: 13, color: CREAM, fontWeight: 600 }}>{p.code}</td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 13, color: MUTED }}>
                          {p.type === "percent" ? `${p.value}%` : `${fmt(p.value)}`}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>
                          {p.usedCount}{p.usageLimit ? ` / ${p.usageLimit}` : ""}
                        </td>
                        <td className="py-3 px-3">
                          <button onClick={() => handleTogglePromo(p.code, !p.active)}
                            style={{ fontFamily: MONO, fontSize: 10, color: p.active ? "#4caf7d" : `${CREAM}45` }}>
                            {p.active ? "● Активен" : "○ Отключён"}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button onClick={() => handleDeletePromo(p.code)} style={{ color: "#E05A5A" }}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {promoCodes.length === 0 && <p className="py-10 text-center" style={{ fontFamily: MONO, fontSize: 12, color: FAINT }}>Промокодов пока нет</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AdminApp() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  function handleLogin(t: string) { localStorage.setItem(ADMIN_TOKEN_KEY, t); setToken(t); }
  function handleLogout() { localStorage.removeItem(ADMIN_TOKEN_KEY); setToken(null); }
  return token ? <AdminDashboard token={token} onLogout={handleLogout} /> : <AdminLogin onLogin={handleLogin} />;
}
