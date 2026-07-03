import { useState, useEffect, useRef } from "react";
import logoImg from "@/imports/____________________.png";
import {
  ShoppingBag, Menu, X, Star, ArrowRight, Check,
  Plus, Minus, ChevronLeft, Truck, Send, Heart,
  Sparkles, Clock, Shield, Instagram, MessageCircle,
  Search, Zap, RotateCw, Layers, Palette, Package, Phone,
  Lock, LogOut, Pencil, Trash2, PackageSearch, ClipboardList, Upload
} from "lucide-react";

type Page = "home" | "catalog" | "product" | "about" | "custom" | "faq" | "business" | "privacy";

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
}
interface CartItem { product: Product; qty: number }

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG    = "#181411";
const CARD  = "#201C18";
const LIGHT = "#F0EAE2";   // light card bg
const CREAM = "#ECE6DF";
const OG    = "#E07A34";   // orange accent

const JK  = "'Plus Jakarta Sans', sans-serif";  // headings & display
const MONO = "'IBM Plex Mono', monospace";

// ── Contacts ───────────────────────────────────────────────────────────────────
const TELEGRAM_HANDLE = "she_knows_s";
const TELEGRAM_URL = `https://t.me/${TELEGRAM_HANDLE}`;
const INSTAGRAM_HANDLE = "_satori_studio_";
const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`;
const EMAIL = "studiosatori@yandex.com";
const PHONE = "+7 993 519-51-41";
const PHONE_HREF = "+79935195141";
const BODY = "'Onest', sans-serif";

// ── Доставка ───────────────────────────────────────────────────────────────────
// Ozon Доставка добавится сюда, когда будет одобрена заявка и подключён API —
// пока это просто пункт выбора, курьер согласовывается вручную по контактам заказа.
const DELIVERY_METHODS = ["СДЭК / Почта России", "Ozon Доставка", "Самовывоз (Москва)"];

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);

// ── Logo — brand-book wordmark PNG ────────────────────────────────────────────
function Logo({ height = 36, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    <img
      src={logoImg}
      alt="SATORI"
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
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{ background: scrolled ? `${BG}ee` : `linear-gradient(to bottom, ${BG}80 0%, ${BG}00 100%)`, backdropFilter: scrolled ? "blur(16px)" : "none" }}>
      <div className="max-w-7xl mx-auto px-5 md:px-10 h-14 flex items-center justify-between">
        {/* Logo — hidden on home when not scrolled (like reference: just hamburger+bag) */}
        <button
          onClick={() => { if (scrolled || page !== "home") setPage("home"); else setMobileOpen(!mobileOpen); }}
          className="flex items-center gap-2.5">
          {(scrolled || page !== "home")
            ? <Logo height={36} style={{ background: "transparent" }} />
            : (mobileOpen ? <X size={22} style={{ color: `${CREAM}80` }} /> : <Menu size={22} style={{ color: `${CREAM}80` }} />)
          }
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7">
          {(["catalog","about","custom","business","faq"] as Page[]).map((p) => {
            const labels: Record<string, string> = { catalog: "Каталог", about: "О студии", custom: "На заказ", business: "Бизнесу", faq: "FAQ" };
            return (
              <button key={p} onClick={() => setPage(p)}
                style={{ fontFamily: BODY, fontSize: 13, color: page === p ? OG : `${CREAM}80`, transition: "color 0.2s" }}
                onMouseEnter={(e) => { if (page !== p) (e.currentTarget as HTMLElement).style.color = CREAM; }}
                onMouseLeave={(e) => { if (page !== p) (e.currentTarget as HTMLElement).style.color = `${CREAM}80`; }}>
                {labels[p]}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <button className="hidden md:flex" style={{ color: `${CREAM}50` }}><Search size={17} /></button>
          <button onClick={onCartOpen} className="relative" style={{ color: `${CREAM}80` }}>
            <ShoppingBag size={19} />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: OG, borderRadius: 99 }}>{cartCount}</span>
            )}
          </button>
          {(scrolled || page !== "home") && (
            <button className="md:hidden" style={{ color: `${CREAM}70` }} onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div style={{ backgroundColor: BG, borderTop: `1px solid ${CREAM}12` }} className="md:hidden px-5 py-5 flex flex-col gap-5">
          {(["catalog","about","custom","business","faq"] as Page[]).map((p) => {
            const labels: Record<string, string> = { catalog: "Каталог", about: "О студии", custom: "На заказ", business: "Бизнесу", faq: "FAQ" };
            return <button key={p} onClick={() => { setPage(p); setMobileOpen(false); }}
              className="text-left text-sm" style={{ fontFamily: BODY, color: `${CREAM}70` }}>{labels[p]}</button>;
          })}
        </div>
      )}
    </header>
  );
}

// ── Checkout API ──────────────────────────────────────────────────────────────
async function submitCheckout(items: CartItem[], customer: { name: string; phone: string; email?: string; delivery?: string; comment?: string }) {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((i) => ({ id: i.product.id, name: i.product.name, price: i.product.price, qty: i.qty })),
      customer,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Не удалось оформить заказ");
  return data as { orderId: string; confirmationUrl: string };
}

// ── Согласие на обработку персональных данных (переиспользуется в формах) ───
function ConsentCheckbox({ checked, onChange, onOpenPolicy }: {
  checked: boolean; onChange: (v: boolean) => void; onOpenPolicy: () => void;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0" style={{ accentColor: OG, width: 15, height: 15 }} />
      <span style={{ fontFamily: BODY, fontSize: 11, color: `${CREAM}55`, lineHeight: 1.5 }}>
        Согласен(на) с{" "}
        <button type="button" onClick={onOpenPolicy} style={{ color: OG, textDecoration: "underline" }}>
          политикой обработки персональных данных
        </button>
      </span>
    </label>
  );
}

// ── Cart Drawer ────────────────────────────────────────────────────────────────
function CartDrawer({ open, onClose, items, onQtyChange, onRemove, onNavigate }: {
  open: boolean; onClose: () => void; items: CartItem[];
  onQtyChange: (id: number, d: number) => void; onRemove: (id: number) => void; onNavigate: (p: Page) => void;
}) {
  const total = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const [mode, setMode] = useState<"cart" | "checkout" | "quick">("cart");
  const [form, setForm] = useState({ name: "", phone: "", email: "", delivery: DELIVERY_METHODS[0], comment: "" });
  const [quickPhone, setQuickPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [quickConsent, setQuickConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openPolicy = () => { onClose(); onNavigate("privacy"); };

  function reset() {
    setMode("cart"); setError(null); setLoading(false); setConsent(false); setQuickConsent(false);
  }
  function handleClose() { reset(); onClose(); }

  async function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const { confirmationUrl } = await submitCheckout(items, {
        name: form.name, phone: form.phone,
        email: form.email || undefined, delivery: form.delivery,
        comment: form.comment || undefined,
      });
      window.location.href = confirmationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
      setLoading(false);
    }
  }

  async function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const { confirmationUrl } = await submitCheckout(items, { name: "Быстрый заказ", phone: quickPhone });
      window.location.href = confirmationUrl;
    } catch (err) {
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
            <button onClick={() => { setMode("cart"); setError(null); }} style={{ color: `${CREAM}50` }}><ChevronLeft size={18} /></button>
          )}
          <span className="flex-1" style={{ fontFamily: JK, fontWeight: 700, fontSize: 15, color: CREAM }}>
            {mode === "cart" ? "Корзина" : mode === "checkout" ? "Оформление заказа" : "Покупка в 1 клик"}
          </span>
          <button onClick={handleClose} style={{ color: `${CREAM}50` }}><X size={17} /></button>
        </div>

        {mode === "cart" && (
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <ShoppingBag size={36} style={{ color: `${CREAM}20` }} />
                <p style={{ fontFamily: MONO, fontSize: 11, color: `${CREAM}45` }}>Корзина пуста</p>
              </div>
            ) : items.map((item) => (
              <div key={item.product.id} className="flex gap-3">
                <div style={{ width: 56, height: 68, borderRadius: 10, overflow: "hidden", backgroundColor: CARD, flexShrink: 0 }}>
                  <img src={item.product.img} alt={item.product.name} className="w-full h-full object-cover" />
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
                          style={{ border: `1px solid ${CREAM}18`, borderRadius: 6, color: `${CREAM}60` }}>
                          {btn.icon}
                        </button>
                      )
                    )}
                    <button onClick={() => onRemove(item.product.id)} className="ml-auto" style={{ color: `${CREAM}40` }}><X size={11} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {mode === "checkout" && (
          <form onSubmit={handleCheckoutSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ИМЯ</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Как к вам обращаться" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ТЕЛЕФОН</label>
              <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7 900 000-00-00" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>EMAIL (необязательно)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@mail.ru" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>СПОСОБ ДОСТАВКИ</label>
              <select value={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.value })}
                className="w-full px-4 py-3 text-sm outline-none cursor-pointer" style={inputStyle}>
                {DELIVERY_METHODS.map((d) => <option key={d} value={d} style={{ background: BG }}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>АДРЕС / КОММЕНТАРИЙ</label>
              <textarea rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder="Куда доставить, пожелания к заказу" className="w-full px-4 py-3 text-sm outline-none resize-none" style={inputStyle} />
            </div>
            <ConsentCheckbox checked={consent} onChange={setConsent} onOpenPolicy={openPolicy} />
            {error && <p style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A" }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 text-white text-xs tracking-widest uppercase transition-all hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: OG, borderRadius: 12, fontFamily: MONO }}>
              {loading ? "Переходим к оплате…" : `Оплатить ${fmt(total)}`}
            </button>
          </form>
        )}

        {mode === "quick" && (
          <form onSubmit={handleQuickSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <p style={{ fontFamily: BODY, fontSize: 12, color: `${CREAM}55`, lineHeight: 1.6 }}>
              Оставьте телефон — оформим заказ на {fmt(total)} и сразу переведём к оплате.
            </p>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ТЕЛЕФОН</label>
              <input required type="tel" value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)}
                placeholder="+7 900 000-00-00" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
            </div>
            <ConsentCheckbox checked={quickConsent} onChange={setQuickConsent} onOpenPolicy={openPolicy} />
            {error && <p style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A" }}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 text-white text-xs tracking-widest uppercase transition-all hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: OG, borderRadius: 12, fontFamily: MONO }}>
              {loading ? "Переходим к оплате…" : `Оплатить ${fmt(total)}`}
            </button>
          </form>
        )}

        {mode === "cart" && items.length > 0 && (
          <div className="px-5 py-5 space-y-2.5" style={{ borderTop: `1px solid ${CREAM}0e` }}>
            <div className="flex justify-between mb-1">
              <span style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}50` }}>Итого</span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: CREAM }}>{fmt(total)}</span>
            </div>
            <button onClick={() => setMode("checkout")} className="w-full py-3.5 text-white text-xs tracking-widest uppercase transition-all hover:brightness-110"
              style={{ backgroundColor: OG, borderRadius: 12, fontFamily: MONO }}>Оформить заказ</button>
            <button onClick={() => setMode("quick")} className="w-full py-3 text-xs tracking-widest uppercase transition-colors"
              style={{ border: `1px solid ${CREAM}15`, borderRadius: 12, fontFamily: MONO, color: `${CREAM}50` }}>Купить в 1 клик</button>
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
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 text-white shadow-2xl transition-all duration-200 hover:scale-105"
      style={{ backgroundColor: OG, borderRadius: 99, padding: h ? "12px 18px" : "12px 14px" }}>
      <Send size={15} />
      {h && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em" }}>Telegram</span>}
    </a>
  );
}

// ── HomePage ───────────────────────────────────────────────────────────────────
function HomePage({ products, setPage, onSelect, onAdd }: {
  products: Product[]; setPage: (p: Page) => void; onSelect: (p: Product) => void; onAdd: (p: Product) => void;
}) {
  const [heroIdx, setHeroIdx] = useState(0);
  const [fav, setFav] = useState<number[]>([]);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Slide 0 = intro, slides 1..N = products
  const TOTAL_SLIDES = products.length + 1;
  useEffect(() => {
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % TOTAL_SLIDES), 5000);
    return () => clearInterval(t);
  }, []);
  const hero = products[heroIdx];

  return (
    <div style={{ backgroundColor: BG }}>

      {/* ── HERO ── */}
      <section style={{ height: "100svh", display: "flex", flexDirection: "column" }}>

        {/* Отступ под фиксированный навбар */}
        <div style={{ height: 56, flexShrink: 0 }} />

        {/* Слайды — занимают всё оставшееся место */}
        <div style={{ position: "relative", overflow: "hidden", flex: 1, minHeight: 0 }}>

          {/* Слайды — анимация fade + slide */}

          {/* ── СЛАЙД 0: интро с логотипом ── */}
          {(() => {
            const isActive = heroIdx === 0;
            return (
              <div key="intro" style={{
                position: isActive ? "relative" : "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: isActive ? 1 : 0,
                transform: isActive ? "translateX(0)" : "translateX(-5%)",
                transition: "opacity 0.22s ease, transform 0.22s ease",
                pointerEvents: isActive ? "auto" : "none",
                display: "flex",
                alignItems: "center",
                padding: isMobile ? "24px 24px" : "32px clamp(56px, 6vw, 120px)",
                gap: 32,
              }}>
                {/* Левая колонка */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Логотип */}
                  <div style={{ marginBottom: 20 }}>
                    <Logo height={isMobile ? 40 : 52} style={{ background: "transparent" }} />
                  </div>

                  {/* Линия-акцент */}
                  <div style={{ width: 32, height: 2, backgroundColor: OG, borderRadius: 2, marginBottom: 20 }} />

                  {/* Слоган */}
                  <h1 style={{
                    fontFamily: JK, fontWeight: 800,
                    fontSize: isMobile ? 30 : "clamp(32px, 4.5vw, 52px)",
                    color: CREAM, lineHeight: 1.1,
                    marginBottom: 14, letterSpacing: "-0.02em",
                  }}>
                    Предметы,<br />которые<br />остаются
                  </h1>

                  {/* Описание */}
                  <p style={{
                    fontFamily: BODY,
                    fontSize: isMobile ? 13 : 14,
                    color: `${CREAM}55`,
                    lineHeight: 1.65,
                    marginBottom: 24,
                    maxWidth: 320,
                  }}>
                    Авторские 3D-объекты из студии в Москве — декор, светильники, украшения и изделия на заказ.
                  </p>

                  {/* CTA */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={() => setHeroIdx(1)}
                      style={{ fontFamily: JK, fontWeight: 700, fontSize: 13, backgroundColor: OG, color: "#fff", borderRadius: 99, padding: "11px 24px", border: "none" }}
                      className="hover:brightness-110 transition-all">
                      Смотреть изделия
                    </button>
                    <button onClick={() => setPage("about")}
                      style={{ fontFamily: JK, fontWeight: 600, fontSize: 13, color: `${CREAM}55`, border: `1px solid ${CREAM}18`, borderRadius: 99, padding: "11px 20px", backgroundColor: "transparent" }}>
                      О студии
                    </button>
                  </div>

                  {/* Бейджи — только десктоп */}
                  {!isMobile && (
                    <div style={{ display: "flex", gap: 28, marginTop: 32 }}>
                      {[{ n: "340+", l: "изделий" }, { n: "3+", l: "года" }, { n: "98%", l: "довольных" }].map((s) => (
                        <div key={s.l}>
                          <p style={{ fontFamily: JK, fontWeight: 800, fontSize: 20, color: OG, lineHeight: 1 }}>{s.n}</p>
                          <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}55`, marginTop: 3 }}>{s.l}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Правая колонка — коллаж (десктоп) или одно фото (мобайл) */}
                {isMobile ? (
                  <div style={{ flexShrink: 0, width: "38%", display: "flex", flexDirection: "column", gap: 8 }}>
                    {products.slice(0, 2).map((p, idx) => (
                      <div key={p.id} onClick={() => setHeroIdx(idx + 1)} style={{
                        borderRadius: 14, overflow: "hidden", cursor: "pointer",
                        aspectRatio: "3/4", backgroundColor: "#221E18",
                        transform: idx === 1 ? "translateX(10px)" : "none",
                        boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
                      }} className="group">
                        <img src={p.img} alt={p.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(1.15)", display: "block" }}
                          className="group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: 220, alignSelf: "center" }}>
                    {products.slice(0, 4).map((p, idx) => (
                      <div key={p.id} onClick={() => setHeroIdx(idx + 1)} style={{
                        borderRadius: 14, overflow: "hidden", cursor: "pointer",
                        aspectRatio: "3/4", backgroundColor: "#221E18",
                        transform: idx % 2 === 1 ? "translateY(16px)" : "none",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                      }} className="group">
                        <img src={p.img} alt={p.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(1.1)", display: "block" }}
                          className="group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── СЛАЙДЫ 1..N: товары ── */}
          {products.map((p, i) => {
            const slideIdx = i + 1;
            return <div
              key={p.id}
              style={{
                position: "absolute",
                inset: 0,
                opacity: slideIdx === heroIdx ? 1 : 0,
                transform: slideIdx === heroIdx ? "translateX(0)" : slideIdx < heroIdx ? "translateX(-5%)" : "translateX(5%)",
                transition: "opacity 0.22s ease, transform 0.22s ease",
                pointerEvents: slideIdx === heroIdx ? "auto" : "none",
                ...(isMobile
                  ? { display: "flex", flexDirection: "column" as const, padding: 16, height: "100%" }
                  : { display: "flex", alignItems: "stretch", padding: "20px 0 20px clamp(48px, 6vw, 120px)", gap: 24 }
                ),
              }}
            >
              {isMobile ? (
                /* ── МОБАЙЛ: карточка во всю ширину, текст поверх левого затемнения ── */
                <div style={{
                  position: "relative",
                  borderRadius: 24,
                  overflow: "hidden",
                  height: "calc(100% - 32px)",
                  minHeight: 400,
                  backgroundColor: "#221E18",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                }}>
                  {/* Фото на весь блок */}
                  <img src={p.img} alt={p.name} style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    objectFit: "cover", objectPosition: "center 20%",
                    filter: "brightness(1.2) contrast(1.05)",
                  }} />

                  {/* Левое затемнение — для читаемости текста */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: `linear-gradient(100deg,
                      rgba(14,12,9,0.92) 0%,
                      rgba(14,12,9,0.75) 38%,
                      rgba(14,12,9,0.25) 62%,
                      transparent 100%)`,
                  }} />
                  {/* Нижнее затемнение */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: `linear-gradient(to top, rgba(14,12,9,0.6) 0%, transparent 45%)`,
                  }} />

                  {/* Бейдж + сердце */}
                  {p.badge && (
                    <span style={{
                      position: "absolute", top: 16, left: 16, zIndex: 3,
                      fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em",
                      backgroundColor: OG, color: "#fff", padding: "3px 10px", borderRadius: 6,
                    }}>{p.badge}</span>
                  )}
                  <button onClick={() => setFav((f) => f.includes(p.id) ? f.filter((x) => x !== p.id) : [...f, p.id])}
                    style={{ position: "absolute", top: 16, right: 16, zIndex: 3 }}>
                    <Heart size={20} fill={fav.includes(p.id) ? OG : "none"} style={{ color: fav.includes(p.id) ? OG : `${CREAM}80` }} />
                  </button>

                  {/* Текст поверх левого затемнения */}
                  <div style={{
                    position: "absolute", inset: 0, zIndex: 2,
                    display: "flex", flexDirection: "column", justifyContent: "center",
                    padding: "20px 50% 20px 22px",
                  }}>
                    <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}50`, marginBottom: 10 }}>
                      {String(slideIdx).padStart(2, "0")} / {String(products.length).padStart(2, "0")}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                      <span style={{ width: 14, height: 2, backgroundColor: OG, borderRadius: 2, display: "inline-block" }} />
                      <span style={{ fontFamily: MONO, fontSize: 8, color: OG, letterSpacing: "0.25em" }}>{p.category.toUpperCase()}</span>
                    </div>
                    <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 26, color: CREAM, lineHeight: 1.05, marginBottom: 4, letterSpacing: "-0.02em" }}>
                      {p.name}
                    </h1>
                    <p style={{ fontFamily: JK, fontStyle: "italic", fontSize: 13, color: `${CREAM}60`, marginBottom: 10, lineHeight: 1.2 }}>
                      {p.nameEn}™
                    </p>
                    <p style={{ fontFamily: BODY, fontSize: 11, color: `${CREAM}60`, lineHeight: 1.55, marginBottom: 16 }}>
                      {p.description}
                    </p>
                    <p style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, color: OG, marginBottom: 14 }}>
                      {fmt(p.price)}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => onSelect(p)}
                        style={{ fontFamily: JK, fontWeight: 700, fontSize: 12, backgroundColor: OG, color: "#fff", borderRadius: 99, padding: "9px 18px", border: "none" }}
                        className="hover:brightness-110 transition-all">
                        Подробнее
                      </button>
                      <button onClick={() => onAdd(p)}
                        style={{ fontFamily: MONO, fontSize: 10, color: `${CREAM}60`, border: `1px solid ${CREAM}25`, borderRadius: 99, padding: "9px 12px", backgroundColor: "transparent" }}>
                        + Корзина
                      </button>
                    </div>
                  </div>

                  {/* Статус снизу-справа */}
                  <p style={{ position: "absolute", bottom: 14, right: 16, fontFamily: MONO, fontSize: 9, zIndex: 3, color: p.inStock ? "#4caf7d" : `${CREAM}40` }}>
                    {p.inStock ? "● В наличии" : `○ ${p.lead}`}
                  </p>
                </div>
              ) : (
                /* ── ДЕСКТОП: текст слева + фото справа ── */
                <>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 4 }}>
                    <p style={{ fontFamily: MONO, fontSize: 10, color: `${CREAM}45`, marginBottom: 12 }}>
                      {String(slideIdx).padStart(2, "0")} / {String(products.length).padStart(2, "0")}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 16, height: 2, backgroundColor: OG, borderRadius: 2, display: "inline-block" }} />
                      <span style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.28em" }}>{p.category.toUpperCase()}</span>
                    </div>
                    <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: "clamp(26px, 6.5vw, 52px)", color: CREAM, lineHeight: 1.0, marginBottom: 4, letterSpacing: "-0.02em", wordBreak: "break-word" }}>
                      {p.name}
                    </h1>
                    <p style={{ fontFamily: JK, fontStyle: "italic", fontWeight: 400, fontSize: "clamp(13px, 3vw, 20px)", color: `${CREAM}60`, marginBottom: 12, lineHeight: 1.2 }}>
                      {p.nameEn}™
                    </p>
                    <p style={{ fontFamily: BODY, fontSize: 12, color: `${CREAM}60`, lineHeight: 1.6, marginBottom: 18 }}>{p.description}</p>
                    <p style={{ fontFamily: MONO, fontWeight: 700, fontSize: 22, color: OG, marginBottom: 16 }}>{fmt(p.price)}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button onClick={() => onSelect(p)}
                        style={{ fontFamily: JK, fontWeight: 700, fontSize: 13, backgroundColor: OG, color: "#fff", borderRadius: 99, padding: "10px 20px", border: "none" }}
                        className="hover:brightness-110 transition-all">Подробнее</button>
                      <button onClick={() => onAdd(p)}
                        style={{ fontFamily: MONO, fontSize: 10, color: `${CREAM}55`, border: `1px solid ${CREAM}20`, borderRadius: 99, padding: "10px 14px", backgroundColor: "transparent" }}>
                        + Корзина
                      </button>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, width: "46%", position: "relative", display: "flex", flexDirection: "column", paddingRight: "clamp(36px, 6vw, 120px)" }}>
                    <button onClick={() => setFav((f) => f.includes(p.id) ? f.filter((x) => x !== p.id) : [...f, p.id])}
                      style={{ position: "absolute", top: 12, right: 48, zIndex: 2 }}>
                      <Heart size={18} fill={fav.includes(p.id) ? OG : "none"} style={{ color: fav.includes(p.id) ? OG : `${CREAM}70` }} />
                    </button>
                    {p.badge && (
                      <span style={{ position: "absolute", top: 12, left: 12, zIndex: 2, fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", backgroundColor: OG, color: "#fff", padding: "3px 8px", borderRadius: 6 }}>{p.badge}</span>
                    )}
                    <div style={{ flex: 1, borderRadius: 20, overflow: "hidden", backgroundColor: "#221E18", boxShadow: "-8px 0 32px rgba(0,0,0,0.4)", minHeight: 320 }}>
                      <img src={p.img} alt={p.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(1.15) contrast(1.05)", display: "block" }} />
                    </div>
                    <p style={{ fontFamily: MONO, fontSize: 9, color: p.inStock ? "#4caf7d" : `${CREAM}55`, marginTop: 8, textAlign: "center" }}>
                      {p.inStock ? "● В наличии" : `○ Под заказ · ${p.lead}`}
                    </p>
                  </div>
                </>
              )}
            </div>;
          })}
        </div>{/* конец слайдов */}

        {/* Точки + популярные — прижаты к низу секции */}
        <div style={{ flexShrink: 0, backgroundColor: BG }}>
          {/* Точки навигации */}
          <div style={{ display: "flex", justifyContent: "center", gap: 7, padding: "10px 0 14px" }}>
            {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
              <button key={i} onClick={() => setHeroIdx(i)}
                className="rounded-full transition-all duration-300"
                style={{ height: 5, width: i === heroIdx ? 24 : 5, backgroundColor: i === heroIdx ? OG : `${CREAM}20` }} />
            ))}
          </div>

          {/* Популярные изделия */}
          <div style={{ borderTop: `1px solid ${CREAM}0c`, padding: "14px clamp(20px, 6vw, 120px) 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontFamily: JK, fontWeight: 700, fontSize: 14, color: CREAM }}>Популярные изделия</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: `${CREAM}45` }}>
                {heroIdx === 0 ? `1/${products.length}` : `${heroIdx}/${products.length}`}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
              {products.map((p, i) => (
                <button key={p.id} onClick={() => setHeroIdx(i + 1)}
                  className="shrink-0 flex flex-col items-start group" style={{ gap: 5 }}>
                  <div style={{
                    width: 60, height: 74, borderRadius: 10, overflow: "hidden",
                    backgroundColor: "#221E18",
                    boxShadow: (i + 1) === heroIdx ? `inset 0 0 0 2px ${OG}` : "inset 0 0 0 2px transparent",
                    transition: "box-shadow 0.2s",
                  }}>
                    <img src={p.img} alt={p.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      style={{ filter: "brightness(1.2) contrast(1.05)", objectPosition: "center 20%" }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: (i + 1) === heroIdx ? OG : `${CREAM}60`, fontWeight: 600 }}>
                    {fmt(p.price).replace(/\s?₽/, "")}₽
                  </span>
                </button>
              ))}
              <button onClick={() => setPage("catalog")} className="shrink-0 flex flex-col items-start" style={{ gap: 5 }}>
                <div style={{ width: 60, height: 74, borderRadius: 10, backgroundColor: OG, display: "flex", alignItems: "center", justifyContent: "center" }}
                  className="hover:brightness-110 transition-all">
                  <span style={{ fontFamily: JK, fontWeight: 700, fontSize: 13, color: "#fff" }}>Все</span>
                </div>
                <span style={{ height: 14 }} />
              </button>
            </div>
          </div>
        </div>

      </section>

      {/* ── How it works — 3-step strip ── */}
      <section style={{ borderTop: `1px solid ${CREAM}0c`, borderBottom: `1px solid ${CREAM}0c` }}
        className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: <Palette size={16} />, n: "01", title: "Выбираете", text: "Из каталога или описываете идею. Консультация бесплатно." },
            { icon: <Layers size={16} />, n: "02", title: "Создаём", text: "От 3D-модели в Nomad Sculpt до готового авторского объекта." },
            { icon: <Truck size={16} />, n: "03", title: "Доставляем", text: "В фирменной упаковке СДЭК или Почтой России по всей стране." },
          ].map((s) => (
            <div key={s.n} className="flex items-start gap-4">
              <div className="shrink-0 flex items-center justify-center"
                style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${OG}20`, color: OG }}>
                {s.icon}
              </div>
              <div>
                <p style={{ fontFamily: MONO, fontSize: 9, color: `${OG}90`, marginBottom: 3 }}>{s.n}</p>
                <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 14, color: CREAM, marginBottom: 4 }}>{s.title}</p>
                <p style={{ fontFamily: BODY, fontSize: 12, color: `${CREAM}50`, lineHeight: 1.5 }}>{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bestsellers grid ── */}
      <section className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 6 }}>— КОЛЛЕКЦИЯ</p>
            <h2 style={{ fontFamily: JK, fontWeight: 800, fontSize: 28, color: CREAM }}>Бестселлеры</h2>
          </div>
          <button onClick={() => setPage("catalog")}
            className="hidden md:flex items-center gap-1.5 text-xs hover:brightness-125 transition-all"
            style={{ fontFamily: MONO, color: OG }}>
            Все изделия <ArrowRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => <GridCard key={p.id} product={p} onSelect={onSelect} onAdd={onAdd} />)}
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] pb-16">
        <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 6 }}>— АССОРТИМЕНТ</p>
        <h2 style={{ fontFamily: JK, fontWeight: 800, fontSize: 28, color: CREAM, marginBottom: 28 }}>Категории</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: "Декор", count: 24, img: "https://images.unsplash.com/photo-1763198461823-3eab41cd33f5?w=600&h=400&fit=crop&auto=format" },
            { name: "Лампы", count: 8, img: "https://images.unsplash.com/photo-1777471031837-a4c55991e638?w=600&h=400&fit=crop&auto=format" },
            { name: "Украшения", count: 12, img: "https://images.unsplash.com/photo-1771788042401-34e21e5640be?w=600&h=400&fit=crop&auto=format" },
            { name: "На заказ", count: null, img: "https://images.unsplash.com/photo-1645378198905-bca326a21167?w=600&h=400&fit=crop&auto=format" },
          ].map((cat) => (
            <button key={cat.name} onClick={() => setPage("catalog")}
              className="relative overflow-hidden group text-left"
              style={{ aspectRatio: "1/1", borderRadius: 16 }}>
              <img src={cat.img} alt={cat.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundColor: CARD }} />
              <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${BG}d0 0%, transparent 55%)` }} />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 15, color: CREAM }}>{cat.name}</p>
                <p style={{ fontFamily: MONO, fontSize: 9, color: OG, marginTop: 2 }}>
                  {cat.count ? `${cat.count} изделий` : "Ваша идея"}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── About strip ── */}
      <section style={{ borderTop: `1px solid ${CREAM}0c` }}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="relative overflow-hidden" style={{ minHeight: 400 }}>
            <img src="https://images.unsplash.com/photo-1609881583302-61548332039c?w=800&h=600&fit=crop&auto=format"
              alt="Студия" className="w-full h-full object-cover absolute inset-0" style={{ backgroundColor: CARD }} />
            <div className="absolute inset-0" style={{ backgroundColor: `${BG}40` }} />
            <div className="absolute top-6 left-6" style={{ backgroundColor: OG, borderRadius: 8, padding: "6px 12px" }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: "#fff", letterSpacing: "0.2em" }}>3D-СТУДИЯ · МОСКВА</span>
            </div>
            <div className="absolute bottom-6 right-6 p-4 text-right"
              style={{ backgroundColor: `${BG}bb`, backdropFilter: "blur(8px)", borderRadius: 12, border: `1px solid ${CREAM}15` }}>
              <p style={{ fontFamily: JK, fontWeight: 800, fontSize: 28, color: OG }}>340+</p>
              <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}60` }}>изделий продано</p>
            </div>
          </div>
          <div className="px-8 md:px-12 py-14 flex flex-col justify-center" style={{ backgroundColor: "#111009" }}>
            <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 14 }}>— О СТУДИИ</p>
            <h2 style={{ fontFamily: JK, fontWeight: 800, fontSize: 26, color: CREAM, lineHeight: 1.2, marginBottom: 18 }}>
              Момент, когда идея<br />становится предметом
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, lineHeight: 1.7, marginBottom: 24 }}>
              «Сатори» — японское слово для мгновенного озарения. Каждое изделие: от 3D-модели в Nomad Sculpt до финишной обработки руками мастера.
            </p>
            <button onClick={() => setPage("about")}
              className="flex items-center gap-2 self-start text-xs hover:gap-3 transition-all"
              style={{ fontFamily: MONO, color: OG }}>
              Узнать больше <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Reviews ── */}
      <section className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16" style={{ borderTop: `1px solid ${CREAM}0c` }}>
        <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 6 }}>— ОТЗЫВЫ</p>
        <h2 style={{ fontFamily: JK, fontWeight: 800, fontSize: 28, color: CREAM, marginBottom: 32 }}>Что говорят покупатели</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "Анна К.", city: "Москва", text: "Заказала светильник — мастер уточнила все детали. Качество выше ожиданий, упаковка идеальная.", product: "Подвесной светильник" },
            { name: "Михаил Р.", city: "Санкт-Петербург", text: "Брал сферу в качестве подарка. Все впечатлились — смотрится как дорогой студийный объект.", product: "Геодезическая сфера" },
            { name: "Ольга В.", city: "Екатеринбург", text: "Ваза стоит на столе и все гости спрашивают где купила. Никто не догадывается про 3D-принтер.", product: "Органическая ваза" },
          ].map((r, i) => (
            <div key={i} className="p-6" style={{ backgroundColor: CARD, borderRadius: 16, border: `1px solid ${CREAM}08` }}>
              <div className="flex gap-0.5 mb-4">
                {[1,2,3,4,5].map((j) => <Star key={j} size={11} fill={OG} style={{ color: OG }} />)}
              </div>
              <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}70`, lineHeight: 1.6, marginBottom: 20, fontStyle: "italic" }}>
                "{r.text}"
              </p>
              <div style={{ borderTop: `1px solid ${CREAM}0a`, paddingTop: 14 }}>
                <p style={{ fontFamily: JK, fontWeight: 600, fontSize: 13, color: CREAM }}>{r.name}</p>
                <p style={{ fontFamily: MONO, fontSize: 10, color: `${CREAM}55` }}>{r.city} · {r.product}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Instagram ── */}
      <section className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] pb-16">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Instagram size={15} style={{ color: OG }} />
            <span style={{ fontFamily: MONO, fontSize: 11, color: `${CREAM}60` }}>@{INSTAGRAM_HANDLE}</span>
          </div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.1em" }}>
            Подписаться →
          </a>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {["photo-1763198461823-3eab41cd33f5","photo-1777810831320-db7dc5fef0c4","photo-1777471031837-a4c55991e638",
            "photo-1771788042401-34e21e5640be","photo-1750069685747-527e0c246ef1","photo-1645378198905-bca326a21167"].map((id) => (
            <div key={id} className="aspect-square overflow-hidden group cursor-pointer" style={{ borderRadius: 12 }}>
              <img src={`https://images.unsplash.com/${id}?w=300&h=300&fit=crop&auto=format`} alt=""
                className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-75"
                style={{ backgroundColor: CARD }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Grid product card ──────────────────────────────────────────────────────────
function GridCard({ product, onSelect, onAdd }: {
  product: Product; onSelect: (p: Product) => void; onAdd: (p: Product) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div className="relative cursor-pointer group"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => onSelect(product)}>
      <div className="relative overflow-hidden" style={{ aspectRatio: "3/4", borderRadius: 14, backgroundColor: CARD }}>
        <img src={product.img} alt={product.name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundColor: "#2A2118", filter: "brightness(1.25) contrast(1.05)" }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${BG}cc 0%, transparent 55%)` }} />
        {product.badge && (
          <div className="absolute top-3 left-3">
            <span style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: "0.15em",
              backgroundColor: product.badge === "Хит" ? OG : product.badge === "Новинка" ? CREAM : "transparent",
              color: product.badge === "Лимит" ? OG : "#13100C",
              border: product.badge === "Лимит" ? `1px solid ${OG}` : "none",
              padding: "3px 8px", borderRadius: 6,
            }}>{product.badge}</span>
          </div>
        )}
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px]"
            style={{ backgroundColor: `${BG}b3` }}>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: CREAM, border: `1px solid ${CREAM}40`, backgroundColor: `${BG}90`, padding: "6px 14px", borderRadius: 8, whiteSpace: "nowrap" }}>
              Под заказ · {product.lead}
            </span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}60`, marginBottom: 2 }}>{product.category}</p>
          <p style={{ fontFamily: JK, fontWeight: 600, fontSize: 13, color: CREAM, lineHeight: 1.25, marginBottom: 3 }}>{product.name}</p>
          <span style={{ fontFamily: MONO, fontSize: 12, color: OG, fontWeight: 600 }}>{fmt(product.price)}</span>
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onAdd(product); }}
        className="w-full mt-2 py-2.5 text-white text-xs tracking-widest uppercase transition-opacity hover:brightness-110"
        style={{ backgroundColor: OG, borderRadius: 10, fontFamily: MONO, opacity: hov ? 1 : 0 }}>
        В корзину
      </button>
    </div>
  );
}

// ── Catalog Page ───────────────────────────────────────────────────────────────
function CatalogPage({ products, onSelect, onAdd }: { products: Product[]; onSelect: (p: Product) => void; onAdd: (p: Product) => void }) {
  const [cat, setCat] = useState("Все");
  const [sort, setSort] = useState("popular");
  const [inStock, setInStock] = useState(false);
  const cats = ["Все", "Декор", "Лампы", "Украшения"];
  const filtered = products
    .filter((p) => cat === "Все" || p.category === cat)
    .filter((p) => !inStock || p.inStock)
    .sort((a, b) => sort === "price_asc" ? a.price - b.price : sort === "price_desc" ? b.price - a.price : 0);

  return (
    <div style={{ backgroundColor: BG }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-12">
        <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 6 }}>— ВСЕ ИЗДЕЛИЯ</p>
        <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 36, color: CREAM, marginBottom: 36 }}>Каталог</h1>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-5"
          style={{ borderBottom: `1px solid ${CREAM}0c` }}>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                className="px-4 py-1.5 text-xs transition-colors"
                style={{
                  fontFamily: MONO, borderRadius: 8,
                  backgroundColor: cat === c ? OG : `${CREAM}08`,
                  border: `1px solid ${cat === c ? OG : `${CREAM}12`}`,
                  color: cat === c ? "#fff" : `${CREAM}55`,
                }}>{c}</button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setInStock(!inStock)} className="relative cursor-pointer"
                style={{ width: 32, height: 16, backgroundColor: inStock ? OG : `${CREAM}18`, borderRadius: 99 }}>
                <div style={{ position: "absolute", top: 2, width: 12, height: 12, backgroundColor: BG, borderRadius: 99, transition: "transform 0.2s", transform: inStock ? "translateX(18px)" : "translateX(2px)" }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}60` }}>В наличии</span>
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="bg-transparent text-xs px-3 py-1.5 outline-none cursor-pointer"
              style={{ fontFamily: MONO, border: `1px solid ${CREAM}15`, borderRadius: 8, color: `${CREAM}50` }}>
              <option value="popular" style={{ background: BG }}>Популярное</option>
              <option value="price_asc" style={{ background: BG }}>Цена ↑</option>
              <option value="price_desc" style={{ background: BG }}>Цена ↓</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p) => <GridCard key={p.id} product={p} onSelect={onSelect} onAdd={onAdd} />)}
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-24" style={{ fontFamily: MONO, fontSize: 11, color: `${CREAM}50` }}>Нет изделий</div>
        )}
      </div>
    </div>
  );
}

// ── Product Page — matches reference: image top, light card below ──────────────
function ProductPage({ product, products, onBack, onAdd, onSelect }: {
  product: Product; products: Product[]; onBack: () => void; onAdd: (p: Product) => void; onSelect: (p: Product) => void;
}) {
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const imgs = product.imgs ?? [product.img];
  const related = products.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 3);

  function handleAdd() {
    for (let i = 0; i < qty; i++) onAdd(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div style={{ backgroundColor: BG }} className="pt-14 min-h-screen">
      {/* Image top — like reference right screen top half */}
      <div className="relative overflow-hidden" style={{ height: "58vh", minHeight: 340, borderRadius: "0 0 24px 24px" }}>
        <img src={imgs[activeImg]} alt={product.name}
          className="w-full h-full object-cover transition-opacity duration-300"
          style={{ backgroundColor: CARD }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${BG}70 0%, transparent 40%, ${BG}90 100%)` }} />
        <button onClick={onBack} className="absolute top-4 left-5 flex items-center gap-1.5 transition-colors"
          style={{ color: `${CREAM}80` }}>
          <ChevronLeft size={16} />
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em" }}>НАЗАД</span>
        </button>
        {product.badge && (
          <div className="absolute top-4 right-5">
            <span style={{ fontFamily: MONO, fontSize: 9, backgroundColor: OG, color: "#fff", padding: "4px 10px", borderRadius: 8 }}>
              {product.badge}
            </span>
          </div>
        )}
        {/* Photo strip bottom-left — "Photos 1/N" like reference */}
        <div className="absolute bottom-4 left-5 flex items-center gap-2">
          <span style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, marginRight: 4 }}>
            Фото {activeImg + 1}/{imgs.length}
          </span>
          {imgs.map((img, i) => (
            <button key={i} onClick={() => setActiveImg(i)}
              className="overflow-hidden transition-all"
              style={{ width: 42, height: 52, borderRadius: 8,
                boxShadow: i === activeImg ? `inset 0 0 0 2px ${OG}` : "inset 0 0 0 2px transparent",
                opacity: i === activeImg ? 1 : 0.45 }}>
              <img src={img} alt="" className="w-full h-full object-cover" style={{ backgroundColor: CARD }} />
            </button>
          ))}
        </div>
      </div>

      {/* Light card slides up — matches reference exactly */}
      <div className="relative z-10 -mt-5" style={{ backgroundColor: LIGHT, borderRadius: "20px 20px 0 0" }}>
        <div className="max-w-2xl mx-auto px-6 md:px-10 pt-7 pb-10">

          {/* Row 1: price + reviews + CART badge — like reference */}
          <div className="flex items-center gap-3 mb-5">
            <span style={{ fontFamily: JK, fontWeight: 800, fontSize: 26, color: OG }}>
              {fmt(product.price)}
            </span>
            <span style={{ fontFamily: BODY, fontSize: 12, color: "#1A1412", opacity: 0.45 }}>
              {product.inStock ? "В наличии" : `Под заказ · ${product.lead}`}
            </span>
            <div className="ml-auto">
              <span style={{ fontFamily: MONO, fontSize: 9, backgroundColor: OG, color: "#fff", padding: "5px 12px", borderRadius: 99, letterSpacing: "0.1em" }}>
                КОРЗИНА
              </span>
            </div>
          </div>

          {/* Row 2: spec icons — watt/material/size/colors like reference */}
          <div className="flex gap-5 py-4 mb-5" style={{ borderTop: `1px solid rgba(0,0,0,0.08)`, borderBottom: `1px solid rgba(0,0,0,0.08)` }}>
            {[
              { icon: <Zap size={14} />, val: product.watt ?? "—", sub: "мощность" },
              { icon: <Layers size={14} />, val: product.material?.split(",")[0] ?? "—", sub: "материал" },
              { icon: <RotateCw size={14} />, val: product.dims ?? "—", sub: "размер" },
              { icon: <Palette size={14} />, val: String(product.colors ?? 1), sub: "цвета" },
            ].map((s) => (
              <div key={s.sub} className="flex flex-col items-center gap-1 text-center flex-1">
                <div style={{ color: OG }}>{s.icon}</div>
                <p style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, color: "#1A1412" }} className="truncate w-full text-center">{s.val}</p>
                <p style={{ fontFamily: MONO, fontSize: 9, color: "rgba(0,0,0,0.4)" }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Product name */}
          <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 24, color: "#1A1412", marginBottom: 10 }}>{product.name}</h1>
          <p style={{ fontFamily: BODY, fontSize: 13, color: "rgba(0,0,0,0.55)", lineHeight: 1.65, marginBottom: 20 }}>
            {product.description}
          </p>

          {/* Customization note */}
          <div className="flex gap-2.5 p-3.5 mb-6" style={{ backgroundColor: `${OG}15`, borderLeft: `3px solid ${OG}`, borderRadius: 8 }}>
            <Sparkles size={13} style={{ color: OG, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontFamily: BODY, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
              Можно кастомизировать — цвет, размер, гравировка. Напишите в Telegram.
            </p>
          </div>

          {/* Qty row */}
          <div className="flex gap-3 mb-3">
            <div className="flex items-center" style={{ border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 10 }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-12 flex items-center justify-center" style={{ color: "rgba(0,0,0,0.4)" }}><Minus size={11} /></button>
              <span style={{ fontFamily: MONO, fontSize: 13, color: "#1A1412", width: 28, textAlign: "center" }}>{qty}</span>
              <button onClick={() => setQty(qty + 1)} className="w-10 h-12 flex items-center justify-center" style={{ color: "rgba(0,0,0,0.4)" }}><Plus size={11} /></button>
            </div>
            {/* BUY NOW — orange pill like reference */}
            <button onClick={handleAdd} className="flex-1 text-white text-xs tracking-widest uppercase font-bold hover:brightness-110 transition-all"
              style={{ backgroundColor: added ? "#1f7a4d" : OG, borderRadius: 12, fontFamily: JK, fontSize: 13, fontWeight: 700 }}>
              {added ? "✓ Добавлено" : "В корзину"}
            </button>
          </div>
          <button className="w-full py-3 text-xs font-semibold transition-colors"
            style={{ border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 12, fontFamily: JK, color: "rgba(0,0,0,0.45)" }}>
            Купить в 1 клик
          </button>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-14" style={{ borderTop: `1px solid ${CREAM}0c` }}>
          <h2 style={{ fontFamily: JK, fontWeight: 800, fontSize: 22, color: CREAM, marginBottom: 28 }}>С этим смотрят</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {related.map((p) => <GridCard key={p.id} product={p} onSelect={onSelect} onAdd={onAdd} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── About Page ─────────────────────────────────────────────────────────────────
function AboutPage() {
  return (
    <div style={{ backgroundColor: BG }} className="pt-14 min-h-screen">
      <div className="relative h-64 md:h-80 overflow-hidden">
        <img src="https://images.unsplash.com/photo-1595351298020-038700609878?w=1600&h=600&fit=crop&auto=format"
          alt="Студия" className="w-full h-full object-cover" style={{ backgroundColor: CARD }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 30%, ${BG})` }} />
        <div className="absolute bottom-8 left-6 md:left-14">
          <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 8 }}>— ИСТОРИЯ</p>
          <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 32, color: CREAM }}>О студии и мастере</h1>
        </div>
      </div>
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-12 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-14">
          <div style={{ fontFamily: BODY, fontSize: 13, lineHeight: 1.75, color: `${CREAM}60` }}>
            <p style={{ color: `${CREAM}90`, fontSize: 15, marginBottom: 16 }}>«Сатори» — момент мгновенного озарения в дзен. Именно этот момент я пытаюсь поймать в каждом изделии.</p>
            <p style={{ marginBottom: 12 }}>Студия началась с одного принтера и Nomad Sculpt на iPad. Хотелось создавать предметы с характером, историей, тактильностью.</p>
            <p>Три года спустя — четыре принтера, постоянные покупатели по всей России.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ n: "340+", l: "изделий продано" }, { n: "3+", l: "года на рынке" }, { n: "98%", l: "довольных" }, { n: "4", l: "принтера" }].map((s) => (
              <div key={s.l} className="p-5 flex flex-col gap-1" style={{ backgroundColor: CARD, borderRadius: 14, border: `1px solid ${CREAM}08` }}>
                <p style={{ fontFamily: JK, fontWeight: 800, fontSize: 26, color: OG }}>{s.n}</p>
                <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}55` }}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${CREAM}0c`, paddingTop: 48 }}>
          <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 8 }}>— ПРОЦЕСС</p>
          <h2 style={{ fontFamily: JK, fontWeight: 800, fontSize: 26, color: CREAM, marginBottom: 28 }}>От идеи до вашего стола</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { n: "01", t: "Концепция в Nomad Sculpt", b: "Органическое 3D-лепление на iPad — как настоящая скульптура, только цифровая." },
              { n: "02", t: "Подготовка к печати", b: "Модель оптимизируется: стенки, поддержки, ориентация — всё влияет на прочность." },
              { n: "03", t: "3D-печать", b: "FDM или смоляная печать в зависимости от объекта. Слой за слоем." },
              { n: "04", t: "Финишная обработка", b: "Шлифовка, грунтование, покраска. Здесь изделие получает свой финальный характер." },
            ].map((s) => (
              <div key={s.n} className="p-5 flex gap-4" style={{ backgroundColor: CARD, borderRadius: 14, border: `1px solid ${CREAM}08` }}>
                <p style={{ fontFamily: MONO, fontSize: 9, color: `${OG}70`, flexShrink: 0, marginTop: 2 }}>{s.n}</p>
                <div>
                  <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 14, color: CREAM, marginBottom: 6 }}>{s.t}</p>
                  <p style={{ fontFamily: BODY, fontSize: 12, color: `${CREAM}50`, lineHeight: 1.6 }}>{s.b}</p>
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
  const [form, setForm] = useState({ name: "", contact: "", idea: "", budget: "" });
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div style={{ backgroundColor: BG }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-2xl">
        <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 8 }}>— НА ЗАКАЗ</p>
        <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 34, color: CREAM, marginBottom: 12 }}>Изделие на заказ</h1>
        <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, lineHeight: 1.65, marginBottom: 36 }}>
          Расскажите об идее — обсудим детали, согласуем 3D-модель до начала производства.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-10">
          {["Бриф", "Согласование", "Производство"].map((s, i) => (
            <div key={s} className="p-4 text-center" style={{ backgroundColor: CARD, borderRadius: 14, border: `1px solid ${CREAM}08` }}>
              <div className="w-7 h-7 flex items-center justify-center text-white text-xs font-bold mx-auto mb-2"
                style={{ backgroundColor: OG, borderRadius: 99, fontFamily: JK }}>
                {i + 1}
              </div>
              <p style={{ fontFamily: JK, fontWeight: 600, fontSize: 12, color: CREAM }}>{s}</p>
            </div>
          ))}
        </div>
        {sent ? (
          <div className="p-10 text-center" style={{ border: `1px solid ${OG}40`, backgroundColor: `${OG}10`, borderRadius: 16 }}>
            <Check size={28} className="mx-auto mb-4" style={{ color: OG }} />
            <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: CREAM, marginBottom: 8 }}>Бриф отправлен!</p>
            <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55` }}>Напишем в течение 24 часов.</p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="space-y-4">
            {[{ k: "name", l: "Имя", ph: "Как вас зовут" }, { k: "contact", l: "Telegram или email", ph: "@username или email@mail.ru" }].map((f) => (
              <div key={f.k}>
                <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>{f.l.toUpperCase()}</label>
                <input type="text" value={form[f.k as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} placeholder={f.ph}
                  className="w-full px-4 py-3 text-sm placeholder-opacity-30 outline-none transition-colors"
                  style={{ fontFamily: BODY, backgroundColor: CARD, border: `1px solid ${CREAM}12`, borderRadius: 10, color: CREAM }} />
              </div>
            ))}
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>ИДЕЯ / ОПИСАНИЕ</label>
              <textarea value={form.idea} onChange={(e) => setForm({ ...form, idea: e.target.value })}
                placeholder="Опишите что хотите — материал, назначение, вдохновение..." rows={5}
                className="w-full px-4 py-3 text-sm outline-none transition-colors resize-none"
                style={{ fontFamily: BODY, backgroundColor: CARD, border: `1px solid ${CREAM}12`, borderRadius: 10, color: CREAM }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>БЮДЖЕТ</label>
              <select value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="w-full px-4 py-3 text-sm outline-none cursor-pointer"
                style={{ fontFamily: BODY, backgroundColor: CARD, border: `1px solid ${CREAM}12`, borderRadius: 10, color: `${CREAM}70` }}>
                <option value="" style={{ background: BG }}>Выберите диапазон</option>
                {["до 5 000 ₽","5 000 – 15 000 ₽","15 000 – 30 000 ₽","от 30 000 ₽"].map((o) => <option key={o} style={{ background: BG }}>{o}</option>)}
              </select>
            </div>
            <ConsentCheckbox checked={consent} onChange={setConsent} onOpenPolicy={() => setPage("privacy")} />
            <button type="submit" className="text-white px-10 py-4 text-sm font-bold hover:brightness-110 transition-all"
              style={{ backgroundColor: OG, borderRadius: 12, fontFamily: JK }}>
              Отправить бриф
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Business Page ────────────────────────────────────────────────────────────
function BusinessPage({ setPage }: { setPage: (p: Page) => void }) {
  const [form, setForm] = useState({ company: "", name: "", contact: "", type: "", volume: "", comment: "" });
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);

  const inputStyle = { fontFamily: BODY, backgroundColor: CARD, border: `1px solid ${CREAM}12`, borderRadius: 10, color: CREAM } as const;
  const labelStyle = { fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.15em", display: "block", marginBottom: 8 } as const;

  return (
    <div style={{ backgroundColor: BG }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-5xl">
        <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 8 }}>— ДЛЯ БИЗНЕСА</p>
        <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 34, color: CREAM, marginBottom: 12 }}>Опт и корпоративные подарки</h1>
        <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, lineHeight: 1.65, marginBottom: 36, maxWidth: 560 }}>
          Поставляем авторские 3D-объекты магазинам и шоурумам, а также делаем брендированные подарки
          для компаний — от небольшой партии до постоянного сотрудничества.
        </p>

        {/* Trust stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-14">
          {[{ n: "340+", l: "изделий в каталоге" }, { n: "3+", l: "года на рынке" }, { n: "4", l: "принтера в студии" }, { n: "98%", l: "довольных клиентов" }].map((s) => (
            <div key={s.l} className="p-4" style={{ backgroundColor: CARD, borderRadius: 14, border: `1px solid ${CREAM}08` }}>
              <p style={{ fontFamily: JK, fontWeight: 800, fontSize: 22, color: OG, marginBottom: 2 }}>{s.n}</p>
              <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}55` }}>{s.l}</p>
            </div>
          ))}
        </div>

        {/* Two tracks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
          <div className="p-6" style={{ backgroundColor: CARD, borderRadius: 16, border: `1px solid ${CREAM}08` }}>
            <div className="w-9 h-9 flex items-center justify-center mb-4" style={{ backgroundColor: `${OG}20`, borderRadius: 10, color: OG }}>
              <Package size={16} />
            </div>
            <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: CREAM, marginBottom: 10 }}>Опт — магазинам и шоурумам</h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, lineHeight: 1.6, marginBottom: 16 }}>
              Поставляем готовые коллекции и позволяем формировать ассортимент под ваш формат.
            </p>
            <ul className="space-y-2.5">
              {["От 10 изделий — скидка 15%", "От 30 изделий — скидка 25%", "Индивидуальные условия для постоянных партнёров", "Отсрочка платежа обсуждается отдельно"].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check size={13} style={{ color: OG, flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}70`, lineHeight: 1.5 }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="p-6" style={{ backgroundColor: CARD, borderRadius: 16, border: `1px solid ${CREAM}08` }}>
            <div className="w-9 h-9 flex items-center justify-center mb-4" style={{ backgroundColor: `${OG}20`, borderRadius: 10, color: OG }}>
              <Sparkles size={16} />
            </div>
            <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: CREAM, marginBottom: 10 }}>Корпоративные подарки</h2>
            <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, lineHeight: 1.6, marginBottom: 16 }}>
              Брендируем существующие изделия или разрабатываем индивидуальный дизайн под вашу компанию.
            </p>
            <ul className="space-y-2.5">
              {["Гравировка логотипа или имени", "Индивидуальный дизайн под бриф", "Единая упаковка для всей партии", "Сроки — от 2 недель в зависимости от тиража"].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check size={13} style={{ color: OG, flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}70`, lineHeight: 1.5 }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Inquiry form */}
        <div style={{ borderTop: `1px solid ${CREAM}0c`, paddingTop: 40 }}>
          <h2 style={{ fontFamily: JK, fontWeight: 800, fontSize: 22, color: CREAM, marginBottom: 8 }}>Оставить заявку</h2>
          <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, lineHeight: 1.6, marginBottom: 28, maxWidth: 480 }}>
            Расскажите о задаче — свяжемся в течение рабочего дня и обсудим условия.
          </p>
          {sent ? (
            <div className="p-10 text-center max-w-lg" style={{ border: `1px solid ${OG}40`, backgroundColor: `${OG}10`, borderRadius: 16 }}>
              <Check size={28} className="mx-auto mb-4" style={{ color: OG }} />
              <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: CREAM, marginBottom: 8 }}>Заявка отправлена!</p>
              <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55` }}>Свяжемся с вами в течение рабочего дня.</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
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
                <label style={labelStyle}>ТЕЛЕФОН ИЛИ EMAIL</label>
                <input required type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="+7 900 000-00-00 или email@mail.ru" className="w-full px-4 py-3 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ТИП СОТРУДНИЧЕСТВА</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-4 py-3 text-sm outline-none cursor-pointer" style={{ ...inputStyle, color: form.type ? CREAM : `${CREAM}70` }}>
                  <option value="" style={{ background: BG }}>Выберите вариант</option>
                  {["Опт", "Корпоративные подарки", "Пока не уверен(а)"].map((o) => <option key={o} style={{ background: BG }}>{o}</option>)}
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
                <ConsentCheckbox checked={consent} onChange={setConsent} onOpenPolicy={() => setPage("privacy")} />
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="text-white px-10 py-4 text-sm font-bold hover:brightness-110 transition-all"
                  style={{ backgroundColor: OG, borderRadius: 12, fontFamily: JK }}>
                  Отправить заявку
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
    { q: "Какие способы доставки?", a: "СДЭК, Почта России, самовывоз в Москве. Тщательно упаковываем в фирменную коробку." },
  ];
  return (
    <div style={{ backgroundColor: BG }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-3xl">
        <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 8 }}>— ВОПРОСЫ</p>
        <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 34, color: CREAM, marginBottom: 36 }}>FAQ</h1>
        <div style={{ borderTop: `1px solid ${CREAM}0c` }}>
          {faqs.map((f, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${CREAM}0c` }}>
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full text-left py-5 flex justify-between items-center gap-4">
                <span style={{ fontFamily: JK, fontWeight: 600, fontSize: 14, color: CREAM }}>{f.q}</span>
                <ArrowRight size={14} style={{ color: OG, flexShrink: 0, transform: open === i ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {open === i && <p className="pb-5" style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, lineHeight: 1.65 }}>{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Privacy Policy Page ──────────────────────────────────────────────────────
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
    <div style={{ backgroundColor: BG }} className="pt-14 min-h-screen">
      <div className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-16 max-w-3xl">
        <p style={{ fontFamily: MONO, fontSize: 9, color: OG, letterSpacing: "0.3em", marginBottom: 8 }}>— ДОКУМЕНТ</p>
        <h1 style={{ fontFamily: JK, fontWeight: 800, fontSize: 34, color: CREAM, marginBottom: 12 }}>Политика обработки персональных данных</h1>
        <p style={{ fontFamily: BODY, fontSize: 12, color: `${CREAM}40`, marginBottom: 36 }}>Действует с 03.07.2026</p>
        <div className="space-y-8">
          {sections.map((s) => (
            <div key={s.h}>
              <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 15, color: CREAM, marginBottom: 8 }}>{s.h}</h2>
              <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}60`, lineHeight: 1.7, whiteSpace: "pre-line" }}>{s.b}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────
function Footer({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <footer className="px-6 md:px-14 xl:px-[clamp(56px,6vw,120px)] py-14" style={{ backgroundColor: "#0D0B08", borderTop: `1px solid ${CREAM}0c` }}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <Logo height={28} />
          </div>
          <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, lineHeight: 1.65, maxWidth: 260, marginBottom: 20 }}>
            Авторские 3D-объекты из студии в Москве. Каждое изделие — единственное в своём роде.
          </p>
          <div className="flex gap-3">
            {[{ n: "340+", s: "изделий" }, { n: "98%", s: "довольных" }].map((s) => (
              <div key={s.n} className="px-4 py-2.5" style={{ border: `1px solid ${CREAM}0e`, borderRadius: 10 }}>
                <p style={{ fontFamily: JK, fontWeight: 700, fontSize: 14, color: OG }}>{s.n}</p>
                <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}50` }}>{s.s}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}40`, letterSpacing: "0.2em", marginBottom: 18 }}>НАВИГАЦИЯ</p>
          <div className="space-y-3">
            {(["catalog","about","custom","business","faq"] as Page[]).map((p) => {
              const l: Record<string, string> = { catalog: "Каталог", about: "О студии", custom: "На заказ", business: "Бизнесу", faq: "FAQ" };
              return <button key={p} onClick={() => setPage(p)} className="block transition-colors"
                style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}65` }}>{l[p]}</button>;
            })}
          </div>
        </div>
        <div>
          <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}40`, letterSpacing: "0.2em", marginBottom: 18 }}>КОНТАКТЫ</p>
          <div className="space-y-3">
            {[
              { icon: <Send size={11} />, l: "Telegram", h: TELEGRAM_URL },
              { icon: <Instagram size={11} />, l: "Instagram", h: INSTAGRAM_URL },
              { icon: <MessageCircle size={11} />, l: EMAIL, h: `mailto:${EMAIL}` },
              { icon: <Phone size={11} />, l: PHONE, h: `tel:${PHONE_HREF}` },
            ].map((c) => (
              <a key={c.l} href={c.h} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 transition-colors"
                style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}65` }}>
                <span style={{ color: OG }}>{c.icon}</span> {c.l}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-center gap-3" style={{ borderTop: `1px solid ${CREAM}0c`, paddingTop: 28 }}>
        <p style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}40` }}>© 2024 Сатори. Все права защищены.</p>
        <div className="flex gap-5">
          {["Доставка", "Возврат", "Уход"].map((l) => (
            <button key={l} style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45` }}>{l}</button>
          ))}
          <button onClick={() => setPage("privacy")} className="transition-colors"
            style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}45` }}>Политика конфиденциальности</button>
        </div>
      </div>
    </footer>
  );
}

// ── Order Status Modal ───────────────────────────────────────────────────────
type OrderStatus = "checking" | "paid" | "pending_payment" | "canceled" | "error";

function OrderStatusModal({ status, onClose }: { status: OrderStatus; onClose: () => void }) {
  const copy: Record<OrderStatus, { title: string; text: string; icon: React.ReactNode }> = {
    checking: { title: "Проверяем оплату…", text: "Обычно это занимает пару секунд.", icon: <RotateCw size={26} className="animate-spin" style={{ color: OG }} /> },
    paid: { title: "Заказ оплачен!", text: "Мы получили оплату и скоро свяжемся с вами по указанным контактам.", icon: <Check size={26} style={{ color: OG }} /> },
    pending_payment: { title: "Оплата ещё не подтверждена", text: "Если вы уже оплатили — подождите немного и обновите страницу.", icon: <Clock size={26} style={{ color: OG }} /> },
    canceled: { title: "Платёж отменён", text: "Заказ не был оплачен. Можете попробовать снова из корзины.", icon: <X size={26} style={{ color: "#E05A5A" }} /> },
    error: { title: "Не удалось проверить заказ", text: "Попробуйте обновить страницу или напишите нам в Telegram.", icon: <X size={26} style={{ color: "#E05A5A" }} /> },
  };
  const c = copy[status];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-sm p-8 text-center" style={{ backgroundColor: "#1A1612", borderRadius: 20, border: `1px solid ${CREAM}12` }}>
        <div className="mx-auto mb-5 w-14 h-14 flex items-center justify-center" style={{ backgroundColor: `${OG}15`, borderRadius: 99 }}>
          {c.icon}
        </div>
        <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 18, color: CREAM, marginBottom: 8 }}>{c.title}</h2>
        <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}60`, lineHeight: 1.6, marginBottom: status === "checking" ? 0 : 24 }}>{c.text}</p>
        {status !== "checking" && (
          <button onClick={onClose} className="w-full py-3 text-white text-xs tracking-widest uppercase transition-all hover:brightness-110"
            style={{ backgroundColor: OG, borderRadius: 12, fontFamily: MONO }}>Понятно</button>
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
  const [products, setProducts] = useState<Product[]>([]);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then(setProducts).catch(() => setProducts([]));
  }, []);

  function navigate(p: Page) { window.scrollTo({ top: 0, behavior: "smooth" }); setPage(p); }
  function handleSelect(p: Product) { setSelectedProduct(p); setPrevPage(page); navigate("product"); }
  function handleAdd(p: Product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.product.id === p.id);
      return ex ? prev.map((i) => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i)
                : [...prev, { product: p, qty: 1 }];
    });
  }

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("orderId");
    if (!orderId) return;
    window.history.replaceState({}, "", window.location.pathname);
    setOrderStatus("checking");

    let attempts = 0;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setOrderStatus("error"); return; }
        if (data.status === "paid") { setOrderStatus("paid"); setCart([]); return; }
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
      <NavBar page={page} setPage={navigate} cartCount={cartCount} onCartOpen={() => setCartOpen(true)} />
      {page === "home"    && <HomePage    products={products} setPage={navigate} onSelect={handleSelect} onAdd={handleAdd} />}
      {page === "catalog" && <CatalogPage products={products} onSelect={handleSelect} onAdd={handleAdd} />}
      {page === "product" && selectedProduct &&
        <ProductPage product={selectedProduct} products={products} onBack={() => navigate(prevPage)} onAdd={handleAdd} onSelect={handleSelect} />}
      {page === "about"   && <AboutPage />}
      {page === "custom"  && <CustomOrderPage setPage={navigate} />}
      {page === "business" && <BusinessPage setPage={navigate} />}
      {page === "faq"     && <FAQPage />}
      {page === "privacy" && <PrivacyPolicyPage />}
      <Footer setPage={navigate} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={cart}
        onQtyChange={(id, d) => setCart((prev) => prev.map((i) => i.product.id === id ? { ...i, qty: i.qty + d } : i).filter((i) => i.qty > 0))}
        onRemove={(id) => setCart((prev) => prev.filter((i) => i.product.id !== id))} onNavigate={navigate} />
      <FloatingCTA />
      {orderStatus && <OrderStatusModal status={orderStatus} onClose={() => setOrderStatus(null)} />}
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
        <p style={{ fontFamily: BODY, fontSize: 13, color: `${CREAM}55`, textAlign: "center", marginBottom: 24 }}>Satori — управление магазином</p>
        <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль" className="w-full px-4 py-3 text-sm outline-none mb-4"
          style={{ fontFamily: BODY, backgroundColor: BG, border: `1px solid ${CREAM}15`, borderRadius: 10, color: CREAM }} />
        {error && <p style={{ fontFamily: BODY, fontSize: 12, color: "#E05A5A", marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full py-3.5 text-white text-xs tracking-widest uppercase transition-all hover:brightness-110 disabled:opacity-50"
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
    colors: initial?.colors ? String(initial.colors) : "",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      colors: form.colors ? Number(form.colors) : undefined,
    });
  }

  const inputStyle = { fontFamily: BODY, backgroundColor: BG, border: `1px solid ${CREAM}15`, borderRadius: 10, color: CREAM } as const;
  const labelStyle = { fontFamily: MONO, fontSize: 9, color: `${CREAM}45`, letterSpacing: "0.1em", display: "block", marginBottom: 6 } as const;

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
          {["Декор", "Лампы", "Украшения"].map((c) => <option key={c} style={{ background: BG }}>{c}</option>)}
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
              <img src={form.img} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <input required value={form.img} onChange={(e) => setForm({ ...form, img: e.target.value })}
              placeholder="https://... или загрузите файл" className="w-full px-3.5 py-2.5 text-sm outline-none mb-2" style={inputStyle} />
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs cursor-pointer transition-colors"
              style={{ border: `1px solid ${CREAM}18`, borderRadius: 8, fontFamily: MONO, color: `${CREAM}70` }}>
              <Upload size={13} /> {uploading ? "Загрузка…" : "Загрузить с компьютера"}
              <input type="file" accept="image/*" onChange={handleMainUpload} disabled={uploading} className="hidden" />
            </label>
          </div>
        </div>
      </div>
      <div className="md:col-span-2">
        <label style={labelStyle}>ДОПОЛНИТЕЛЬНЫЕ ФОТО (по одному URL на строку)</label>
        <textarea value={form.imgs} onChange={(e) => setForm({ ...form, imgs: e.target.value })} rows={3}
          className="w-full px-3.5 py-2.5 text-sm outline-none resize-none mb-2" style={inputStyle} />
        <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs cursor-pointer transition-colors"
          style={{ border: `1px solid ${CREAM}18`, borderRadius: 8, fontFamily: MONO, color: `${CREAM}70` }}>
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
      <div>
        <label style={labelStyle}>ЦВЕТОВ</label>
        <input type="number" min={0} value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })}
          className="w-full px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
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
        <button type="submit" className="text-white px-8 py-3 text-sm font-bold hover:brightness-110 transition-all"
          style={{ backgroundColor: OG, borderRadius: 10, fontFamily: JK }}>
          Сохранить
        </button>
        <button type="button" onClick={onCancel} className="px-8 py-3 text-sm font-semibold transition-colors"
          style={{ border: `1px solid ${CREAM}18`, borderRadius: 10, fontFamily: JK, color: `${CREAM}70` }}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
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

  useEffect(() => {
    Promise.all([loadProducts(), loadOrders()]).catch(() => setError("Не удалось загрузить данные")).finally(() => setLoading(false));
  }, []);

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

  async function handleStatusChange(id: string, fulfillmentStatus: string) {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, fulfillmentStatus } : o));
    const res = await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ fulfillmentStatus }) });
    if (handleAuthFail(res)) return;
  }

  const paymentBadge: Record<string, { l: string; c: string }> = {
    paid: { l: "Оплачен", c: "#4caf7d" },
    pending_payment: { l: "Ожидает оплаты", c: `${CREAM}70` },
    canceled: { l: "Отменён", c: "#E05A5A" },
  };

  return (
    <div style={{ backgroundColor: BG, fontFamily: BODY }} className="min-h-screen">
      <header className="flex items-center justify-between px-6 md:px-10 h-16" style={{ borderBottom: `1px solid ${CREAM}0c` }}>
        <div className="flex items-center gap-3">
          <Logo height={28} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: `${CREAM}40`, letterSpacing: "0.15em" }}>АДМИНКА</span>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 transition-colors" style={{ fontFamily: MONO, fontSize: 11, color: `${CREAM}55` }}>
          <LogOut size={14} /> Выйти
        </button>
      </header>

      <div className="px-6 md:px-10 pt-6">
        <div className="flex gap-2 mb-8">
          <button onClick={() => setTab("products")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
            style={{ fontFamily: JK, fontWeight: 600, borderRadius: 10, backgroundColor: tab === "products" ? OG : `${CREAM}08`, color: tab === "products" ? "#fff" : `${CREAM}70` }}>
            <PackageSearch size={15} /> Товары
          </button>
          <button onClick={() => setTab("orders")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
            style={{ fontFamily: JK, fontWeight: 600, borderRadius: 10, backgroundColor: tab === "orders" ? OG : `${CREAM}08`, color: tab === "orders" ? "#fff" : `${CREAM}70` }}>
            <ClipboardList size={15} /> Заказы
            {orders.filter((o) => o.fulfillmentStatus === "Новый").length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: "#E05A5A", borderRadius: 99 }}>
                {orders.filter((o) => o.fulfillmentStatus === "Новый").length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <p style={{ fontFamily: MONO, fontSize: 12, color: `${CREAM}40` }}>Загрузка…</p>
        ) : (
          <>
            {error && <p className="mb-4" style={{ fontFamily: BODY, fontSize: 13, color: "#E05A5A" }}>{error}</p>}

            {tab === "products" && (
              <div className="pb-16">
                {editing ? (
                  <div className="max-w-3xl p-6 mb-8" style={{ backgroundColor: CARD, borderRadius: 16, border: `1px solid ${CREAM}08` }}>
                    <h2 style={{ fontFamily: JK, fontWeight: 700, fontSize: 16, color: CREAM, marginBottom: 20 }}>
                      {editing === "new" ? "Новый товар" : `Редактирование: ${editing.name}`}
                    </h2>
                    <AdminProductForm initial={editing === "new" ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} onUpload={handleUpload} />
                  </div>
                ) : (
                  <button onClick={() => setEditing("new")}
                    className="flex items-center gap-2 mb-6 px-5 py-3 text-white text-sm font-bold hover:brightness-110 transition-all"
                    style={{ backgroundColor: OG, borderRadius: 10, fontFamily: JK }}>
                    <Plus size={16} /> Добавить товар
                  </button>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${CREAM}0c` }}>
                        {["Фото", "Название", "Категория", "Цена", "Наличие", ""].map((h) => (
                          <th key={h} className="text-left py-3 px-3" style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}40`, letterSpacing: "0.1em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id} style={{ borderBottom: `1px solid ${CREAM}08` }}>
                          <td className="py-2.5 px-3">
                            <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", backgroundColor: CARD }}>
                              <img src={p.img} alt={p.name} className="w-full h-full object-cover" />
                            </div>
                          </td>
                          <td className="py-2.5 px-3" style={{ fontFamily: BODY, fontSize: 13, color: CREAM, whiteSpace: "nowrap" }}>{p.name}</td>
                          <td className="py-2.5 px-3" style={{ fontFamily: MONO, fontSize: 11, color: `${CREAM}55` }}>{p.category}</td>
                          <td className="py-2.5 px-3" style={{ fontFamily: MONO, fontSize: 12, color: OG, whiteSpace: "nowrap" }}>{fmt(p.price)}</td>
                          <td className="py-2.5 px-3" style={{ fontFamily: MONO, fontSize: 10, color: p.inStock ? "#4caf7d" : `${CREAM}40`, whiteSpace: "nowrap" }}>
                            {p.inStock ? "В наличии" : "Под заказ"}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditing(p)} style={{ color: `${CREAM}55` }}><Pencil size={15} /></button>
                              <button onClick={() => handleDelete(p.id)} style={{ color: "#E05A5A" }}><Trash2 size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {products.length === 0 && <p className="py-10 text-center" style={{ fontFamily: MONO, fontSize: 12, color: `${CREAM}35` }}>Товаров пока нет</p>}
                </div>
              </div>
            )}

            {tab === "orders" && (
              <div className="pb-16 overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${CREAM}0c` }}>
                      {["Дата", "Клиент", "Товары", "Доставка", "Сумма", "Оплата", "Статус"].map((h) => (
                        <th key={h} className="text-left py-3 px-3" style={{ fontFamily: MONO, fontSize: 9, color: `${CREAM}40`, letterSpacing: "0.1em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} style={{ borderBottom: `1px solid ${CREAM}08` }}>
                        <td className="py-3 px-3" style={{ fontFamily: MONO, fontSize: 11, color: `${CREAM}55`, whiteSpace: "nowrap" }}>
                          {new Date(o.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 13, color: CREAM, whiteSpace: "nowrap" }}>
                          <div>{o.customer?.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: `${CREAM}45` }}>{o.customer?.phone}</div>
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 12, color: `${CREAM}70`, maxWidth: 220 }}>
                          {o.items?.map((i: any) => `${i.name} ×${i.qty}`).join(", ")}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: BODY, fontSize: 12, color: `${CREAM}70`, whiteSpace: "nowrap" }}>
                          <div>{o.customer?.delivery ?? "—"}</div>
                          {o.customer?.comment && (
                            <div style={{ fontFamily: MONO, fontSize: 10, color: `${CREAM}40`, maxWidth: 180, whiteSpace: "normal" }}>{o.customer.comment}</div>
                          )}
                        </td>
                        <td className="py-3 px-3" style={{ fontFamily: MONO, fontSize: 12, color: OG, whiteSpace: "nowrap" }}>{fmt(o.amount)}</td>
                        <td className="py-3 px-3" style={{ whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: paymentBadge[o.status]?.c ?? `${CREAM}55` }}>
                            {paymentBadge[o.status]?.l ?? o.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <select value={o.fulfillmentStatus ?? "Новый"} onChange={(e) => handleStatusChange(o.id, e.target.value)}
                            className="px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                            style={{ fontFamily: MONO, backgroundColor: CARD, border: `1px solid ${CREAM}15`, borderRadius: 8, color: CREAM }}>
                            {FULFILLMENT_STATUSES.map((s) => <option key={s} value={s} style={{ background: BG }}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && <p className="py-10 text-center" style={{ fontFamily: MONO, fontSize: 12, color: `${CREAM}35` }}>Заказов пока нет</p>}
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
