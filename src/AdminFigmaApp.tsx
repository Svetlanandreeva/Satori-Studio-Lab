import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  ArrowLeft, ChevronDown, Copy, ExternalLink, Home, Inbox, LogOut, Menu,
  PackageSearch, Pencil, Plus, Save, Search, Tag, Trash2, Upload, X,
  ClipboardList, Image as ImageIcon, Film, Check,
} from "lucide-react";

const TOKEN_KEY = "satori_admin_token";
const CATEGORIES = ["Декор", "Лампы", "Украшения"];
const FULFILLMENT_STATUSES = ["Новый", "В работе", "Собран", "Отправлен", "Выполнен", "Отменён"];

type AdminTab = "orders" | "leads" | "products" | "home" | "promocodes";
type HeroSlide = { type: "image" | "video"; url: string };
type GalleryItem = { id: string; url: string };

type Product = {
  id: number; name: string; nameEn?: string; category: string; price: number; img: string;
  imgs?: string[]; badge?: string; inStock: boolean; lead?: string; material?: string;
  dims?: string; weight?: string; description?: string; watt?: string;
  colorSwatches?: { color: string; img?: string }[]; createdAt?: number;
  limitedEdition?: boolean; editionNumber?: number; editionTotal?: number;
};

type Order = {
  id: string; createdAt: string; status: string; fulfillmentStatus?: string; trackingCode?: string;
  amount: number; subtotal?: number; discount?: number; promoCode?: string;
  items?: Array<{ name: string; qty: number; price?: number; img?: string }>;
  customer?: Record<string, any>;
};

type Lead = {
  id: string; type: "custom" | "business"; createdAt: string; read?: boolean;
  name?: string; company?: string; phone?: string; email?: string; contact?: string;
  budget?: string; idea?: string; inquiryType?: string; volume?: string; comment?: string;
};

type Promo = {
  code: string; type: "percent" | "fixed"; value: number; usageLimit?: number | null;
  usedCount?: number; active: boolean; createdAt?: string; applyTo?: string; minAmount?: number;
  startsAt?: string | null; endsAt?: string | null; oncePerClient?: boolean;
};

const fmtMoney = (n = 0) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
const fmtDate = (value?: string | number) => value ? new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const normalGallery = (items: GalleryItem[]) => items.filter((x) => !x.url.includes("#home-cover-") && !x.url.includes("#inspiration-cover-"));

async function uploadFile(file: File, token: string) {
  const body = new FormData();
  body.append("photo", file);
  const res = await fetch("/api/admin/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Не удалось загрузить файл");
  return String(data.url);
}

function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка входа");
      localStorage.setItem(TOKEN_KEY, data.token); onLogin(data.token);
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка входа"); }
    finally { setLoading(false); }
  }
  return <div className="fa-login"><form onSubmit={submit} className="fa-login-card">
    <div className="fa-brand fa-brand-dark">SATORI</div><div className="fa-kicker">LAB / ADMIN</div>
    <h1>Вход в управление</h1><p>Каталог, заказы, заявки и главная витрина.</p>
    <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" />
    {error && <div className="fa-error">{error}</div>}
    <button className="fa-primary" disabled={loading}>{loading ? "Входим…" : "Войти"}</button>
  </form></div>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="fa-stat"><span>{label}</span><b>{value}</b>{note && <small>{note}</small>}</div>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "sand" | "red" }) {
  return <span className={`fa-badge fa-badge-${tone}`}>{children}</span>;
}

function ProductEditor({ initial, token, onCancel, onSaved, onDelete }: {
  initial: Product | null; token: string; onCancel: () => void; onSaved: () => void; onDelete?: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "", nameEn: initial?.nameEn ?? "", category: initial?.category ?? "Декор",
    price: String(initial?.price ?? ""), img: initial?.img ?? "", imgs: initial?.imgs ?? [], badge: initial?.badge ?? "",
    inStock: initial?.inStock ?? true, lead: initial?.lead ?? "", material: initial?.material ?? "",
    dims: initial?.dims ?? "", weight: initial?.weight ?? "", watt: initial?.watt ?? "", description: initial?.description ?? "",
    limitedEdition: initial?.limitedEdition ?? false, editionNumber: String(initial?.editionNumber ?? ""), editionTotal: String(initial?.editionTotal ?? ""),
    colorSwatches: initial?.colorSwatches ?? [] as { color: string; img?: string }[],
  });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const patch = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));
  async function pickMain(e: ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; e.target.value=""; if (!file) return; setBusy(true); try { patch("img", await uploadFile(file, token)); } catch(e){setError(e instanceof Error?e.message:"Ошибка");} finally{setBusy(false);} }
  async function pickExtra(e: ChangeEvent<HTMLInputElement>) { const files=Array.from(e.target.files??[]); e.target.value=""; if(!files.length)return; setBusy(true); try { const urls=[]; for(const f of files) urls.push(await uploadFile(f,token)); patch("imgs", [...form.imgs,...urls]); } catch(e){setError(e instanceof Error?e.message:"Ошибка");} finally{setBusy(false);} }
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const payload = { ...form, price: Number(form.price)||0, imgs: form.imgs, lead: form.inStock ? undefined : form.lead || undefined,
      editionNumber: form.limitedEdition ? Number(form.editionNumber)||undefined : undefined,
      editionTotal: form.limitedEdition ? Number(form.editionTotal)||undefined : undefined };
    const url = initial ? `/api/admin/products/${initial.id}` : "/api/admin/products";
    try { const res=await fetch(url,{method:initial?"PUT":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)}); if(!res.ok) throw new Error("Не удалось сохранить товар"); onSaved(); }
    catch(e){setError(e instanceof Error?e.message:"Ошибка");} finally{setBusy(false);}
  }
  return <div className="fa-editor-page">
    <button className="fa-back" onClick={onCancel}><ArrowLeft size={14}/> Все товары</button>
    <div className="fa-page-head"><div><h1>{initial?.name || "Новый товар"}</h1><p>{initial ? `Редактирование товара #${initial.id}` : "Добавление новой позиции в каталог"}</p></div><button className="fa-primary fa-desktop-save" form="product-editor"><Save size={14}/> Сохранить товар</button></div>
    <form id="product-editor" onSubmit={save} className="fa-product-editor">
      <section className="fa-card fa-form-card"><div className="fa-section-label">ОСНОВНАЯ ИНФОРМАЦИЯ</div>
        <div className="fa-form-grid">
          <label>НАЗВАНИЕ<input required value={form.name} onChange={e=>patch("name",e.target.value)}/></label>
          <label>НАЗВАНИЕ EN<input value={form.nameEn} onChange={e=>patch("nameEn",e.target.value)}/></label>
          <label>КАТЕГОРИЯ<select value={form.category} onChange={e=>patch("category",e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>ЦЕНА, ₽<input type="number" min="0" required value={form.price} onChange={e=>patch("price",e.target.value)}/></label>
          <label>БЕЙДЖ<select value={form.badge} onChange={e=>patch("badge",e.target.value)}><option value="">Нет</option><option>Хит</option><option>Новинка</option><option>Лимит</option></select></label>
          <label>СРОК<input value={form.inStock?"В наличии":form.lead} onChange={e=>{patch("inStock",e.target.value==="В наличии");patch("lead",e.target.value)}} placeholder="В наличии / 14 дней"/></label>
          <label>МАТЕРИАЛ<input value={form.material} onChange={e=>patch("material",e.target.value)}/></label>
          <label>РАЗМЕРЫ<input value={form.dims} onChange={e=>patch("dims",e.target.value)}/></label>
          <label>ВЕС<input value={form.weight} onChange={e=>patch("weight",e.target.value)}/></label>
          <label>МОЩНОСТЬ<input value={form.watt} onChange={e=>patch("watt",e.target.value)}/></label>
          <label className="fa-span-2">ОПИСАНИЕ<textarea rows={5} value={form.description} onChange={e=>patch("description",e.target.value)}/></label>
        </div>
        <div className="fa-inline-toggles"><button type="button" className={form.inStock?"is-on":""} onClick={()=>patch("inStock",!form.inStock)}>● <span>В наличии</span></button><button type="button" className={form.limitedEdition?"is-on":""} onClick={()=>patch("limitedEdition",!form.limitedEdition)}>○ <span>Лимитированная серия</span></button></div>
        {form.limitedEdition && <div className="fa-form-grid fa-edition"><label>НОМЕР ЭКЗЕМПЛЯРА<input type="number" value={form.editionNumber} onChange={e=>patch("editionNumber",e.target.value)}/></label><label>ВСЕГО В СЕРИИ<input type="number" value={form.editionTotal} onChange={e=>patch("editionTotal",e.target.value)}/></label></div>}
      </section>
      <aside className="fa-card fa-media-card"><div className="fa-section-label">МЕДИА</div><b>Главное фото</b>
        <label className="fa-main-upload">{form.img?<img src={form.img} alt=""/>:<><Upload size={22}/><span>Перетащите фото сюда</span><small>PNG · JPG · WEBP</small></>}<input type="file" accept="image/*" onChange={pickMain}/></label>
        <label className="fa-outline-button">{busy?"Загрузка…":"Заменить фото"}<input type="file" accept="image/*" onChange={pickMain}/></label>
        <b>Дополнительные фото</b><div className="fa-thumbs">{form.imgs.map((u,i)=><div key={`${u}-${i}`} className="fa-thumb"><img src={u} alt=""/><button type="button" onClick={()=>patch("imgs",form.imgs.filter((_,x)=>x!==i))}><X size={12}/></button></div>)}<label className="fa-thumb fa-thumb-add"><Plus size={18}/><input multiple type="file" accept="image/*" onChange={pickExtra}/></label></div>
        <div className="fa-section-label fa-media-label">ЦВЕТА</div><div className="fa-swatches">{form.colorSwatches.map((c,i)=><div key={i} className="fa-swatch" style={{background:c.color}} title={c.color}/>) }<input type="color" onChange={e=>patch("colorSwatches",[...form.colorSwatches,{color:e.target.value}])}/></div>
        {form.img && <div className="fa-product-preview"><img src={form.img} alt=""/><div><b>{form.name||"Название товара"}</b><span>{fmtMoney(Number(form.price)||0)}</span></div></div>}
        {onDelete && <button type="button" className="fa-danger-link" onClick={onDelete}>Удалить товар</button>}
      </aside>
      <button className="fa-primary fa-mobile-save" disabled={busy}><Save size={14}/> Сохранить товар</button>
      {error && <div className="fa-error fa-span-all">{error}</div>}
    </form>
  </div>;
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab,setTab]=useState<AdminTab>("orders"); const [mobileMenu,setMobileMenu]=useState(false);
  const [products,setProducts]=useState<Product[]>([]); const [orders,setOrders]=useState<Order[]>([]); const [leads,setLeads]=useState<Lead[]>([]);
  const [gallery,setGallery]=useState<GalleryItem[]>([]); const [hero,setHero]=useState<{type?:string|null;url?:string|null;slides?:HeroSlide[]}>({slides:[]}); const [promos,setPromos]=useState<Promo[]>([]);
  const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [editing,setEditing]=useState<Product|"new"|null>(null);
  const [selectedOrder,setSelectedOrder]=useState<string>(""); const [selectedLead,setSelectedLead]=useState<string>("");
  const [orderSearch,setOrderSearch]=useState(""); const [leadSearch,setLeadSearch]=useState(""); const [productSearch,setProductSearch]=useState(""); const [productCategory,setProductCategory]=useState("Все");
  const auth={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  const authOnly={Authorization:`Bearer ${token}`};
  function authFail(res:Response){ if(res.status===401){localStorage.removeItem(TOKEN_KEY);onLogout();return true;} return false; }
  async function reload(){ setLoading(true); setError(""); try { const [pr,or,lr,gr,hr,cr]=await Promise.all([fetch("/api/products"),fetch("/api/admin/orders",{headers:auth}),fetch("/api/admin/leads",{headers:auth}),fetch("/api/gallery"),fetch("/api/hero"),fetch("/api/admin/promocodes",{headers:auth})]); if(authFail(or)||authFail(lr)||authFail(cr))return; const [p,o,l,g,h,c]=await Promise.all([pr.json(),or.json(),lr.json(),gr.json(),hr.json(),cr.json()]); setProducts(p);setOrders(o);setLeads(l);setGallery(g);setHero(h);setPromos(c);setSelectedOrder(x=>x||o[0]?.id||"");setSelectedLead(x=>x||l[0]?.id||""); } catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить данные");} finally{setLoading(false);} }
  useEffect(()=>{void reload();},[]);
  async function upload(file:File){return uploadFile(file,token)}
  async function saveProduct(data:Partial<Product>, current:Product|"new"){const url=current==="new"?"/api/admin/products":`/api/admin/products/${current.id}`;const res=await fetch(url,{method:current==="new"?"POST":"PUT",headers:auth,body:JSON.stringify(data)});if(authFail(res))return;if(!res.ok)throw new Error("Не удалось сохранить товар");await reload();setEditing(null);}
  async function deleteProduct(p:Product){if(!confirm(`Удалить «${p.name}»?`))return;const res=await fetch(`/api/admin/products/${p.id}`,{method:"DELETE",headers:auth});if(authFail(res))return;await reload();setEditing(null);}

  const nav:[AdminTab,string,any][]=[["orders","Заказы",ClipboardList],["leads","Заявки",Inbox],["products","Товары",PackageSearch],["home","Главная",Home],["promocodes","Промокоды",Tag]];
  const newOrders=orders.filter(o=>(o.fulfillmentStatus??"Новый")==="Новый").length;
  const unread=leads.filter(l=>!l.read).length;
  const countFor=(t:AdminTab)=>t==="orders"?orders.length:t==="leads"?unread:t==="products"?products.length:t==="promocodes"?promos.filter(p=>p.active).length:0;
  function go(t:AdminTab){setTab(t);setMobileMenu(false);setEditing(null);window.scrollTo({top:0,behavior:"smooth"});}

  if(editing){ const initial=editing==="new"?null:editing; return <div className="admin-figma"><Shell tab="products" nav={nav} countFor={countFor} go={go} onLogout={onLogout} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu}><ProductEditor initial={initial} token={token} onCancel={()=>setEditing(null)} onSaved={async()=>{await reload();setEditing(null)}} onDelete={initial?()=>deleteProduct(initial):undefined}/></Shell></div>; }

  return <div className="admin-figma"><Shell tab={tab} nav={nav} countFor={countFor} go={go} onLogout={onLogout} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu}>
    {loading?<div className="fa-loading">Загрузка…</div>:<>{error&&<div className="fa-error">{error}</div>}
      {tab==="orders"&&<OrdersPage orders={orders} selectedId={selectedOrder} setSelectedId={setSelectedOrder} search={orderSearch} setSearch={setOrderSearch} token={token} onChanged={reload}/>} 
      {tab==="leads"&&<LeadsPage leads={leads} selectedId={selectedLead} setSelectedId={setSelectedLead} search={leadSearch} setSearch={setLeadSearch} token={token} onChanged={reload}/>} 
      {tab==="products"&&<ProductsPage products={products} search={productSearch} setSearch={setProductSearch} category={productCategory} setCategory={setProductCategory} onEdit={setEditing}/>} 
      {tab==="home"&&<HomePage hero={hero} gallery={gallery} token={token} onChanged={reload} onPromos={()=>go("promocodes")}/>} 
      {tab==="promocodes"&&<PromosPage promos={promos} token={token} onChanged={reload}/>} 
    </>}
  </Shell></div>;
}

function Shell({tab,nav,countFor,go,onLogout,mobileMenu,setMobileMenu,children}:{tab:AdminTab;nav:[AdminTab,string,any][];countFor:(t:AdminTab)=>number;go:(t:AdminTab)=>void;onLogout:()=>void;mobileMenu:boolean;setMobileMenu:(v:boolean)=>void;children:React.ReactNode}){
  return <div className="fa-shell"><aside className={`fa-sidebar ${mobileMenu?"is-open":""}`}><div><div className="fa-brand">SATORI</div><div className="fa-kicker">LAB / ADMIN</div></div><nav>{nav.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>go(id)}><Icon size={15}/><span>{label}</span>{countFor(id)>0&&<b>{countFor(id)}</b>}</button>)}</nav><div className="fa-side-extra"><span>ДОПОЛНИТЕЛЬНО</span><a href="/" target="_blank">Открыть сайт <ExternalLink size={12}/></a></div><div className="fa-user"><i>S</i><div><b>Светлана</b><span>Администратор</span></div><button onClick={onLogout}>Выйти</button></div></aside>
  <div className="fa-work"><header className="fa-top"><span>SATORI / Управление</span><a href="/" target="_blank">Витрина <ExternalLink size={12}/></a></header><header className="fa-mobile-head"><button onClick={()=>setMobileMenu(!mobileMenu)}>{mobileMenu?<X/>:<Menu/>}</button><b>SATORI LAB / ADMIN</b><i>S</i></header><main>{children}</main><nav className="fa-bottom-nav">{nav.slice(0,4).map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>go(id)}><Icon size={19}/><span>{label}</span></button>)}</nav></div></div>;
}

function OrdersPage({orders,selectedId,setSelectedId,search,setSearch,token,onChanged}:{orders:Order[];selectedId:string;setSelectedId:(x:string)=>void;search:string;setSearch:(x:string)=>void;token:string;onChanged:()=>void}){
  const filtered=orders.filter(o=>`${o.id} ${o.customer?.name||""} ${o.customer?.phone||""}`.toLowerCase().includes(search.toLowerCase())); const selected=orders.find(o=>o.id===selectedId)||filtered[0];
  const paid=orders.filter(o=>o.status==="paid"); const revenue=paid.reduce((s,o)=>s+o.amount,0); const ship=orders.filter(o=>(o.fulfillmentStatus||"")==="Собран").length;
  const [status,setStatus]=useState(selected?.fulfillmentStatus||"Новый");const [track,setTrack]=useState(selected?.trackingCode||"");
  useEffect(()=>{setStatus(selected?.fulfillmentStatus||"Новый");setTrack(selected?.trackingCode||"")},[selected?.id]);
  async function save(){if(!selected)return;await fetch(`/api/admin/orders/${selected.id}`,{method:"PATCH",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({fulfillmentStatus:status,trackingCode:track})});onChanged();}
  return <><div className="fa-page-head"><div><h1>Заказы</h1><p>Оплата, комплектация и отправка заказов.</p></div></div><div className="fa-stats"><Stat label="НОВЫЕ" value={orders.filter(o=>(o.fulfillmentStatus??"Новый")==="Новый").length} note="требуют внимания"/><Stat label="ОПЛАЧЕНО" value={paid.length} note="за всё время"/><Stat label="К ОТПРАВКЕ" value={ship} note="статус «Собран»"/><Stat label="ВЫРУЧКА" value={fmtMoney(revenue)} note="оплаченные заказы"/></div><div className="fa-toolbar"><label><Search size={15}/><input placeholder="Поиск по заказу или клиенту" value={search} onChange={e=>setSearch(e.target.value)}/></label></div><div className="fa-split"><section className="fa-card fa-table-card"><div className="fa-table-wrap"><table><thead><tr><th>ЗАКАЗ</th><th>КЛИЕНТ</th><th>ТОВАРЫ</th><th>СУММА</th><th>ОПЛАТА</th><th>ДОСТАВКА</th><th>ДАТА</th></tr></thead><tbody>{filtered.map(o=><tr key={o.id} className={selected?.id===o.id?"selected":""} onClick={()=>setSelectedId(o.id)}><td><b>#{o.id.slice(0,8)}</b></td><td>{o.customer?.name||"—"}</td><td>{o.items?.map(i=>`${i.name} ×${i.qty}`).join(", ")||"—"}</td><td><b>{fmtMoney(o.amount)}</b></td><td><Badge tone={o.status==="paid"?"green":o.status==="canceled"?"red":"neutral"}>{o.status==="paid"?"Оплачен":o.status==="canceled"?"Отменён":"Ожидает"}</Badge></td><td><Badge tone={(o.fulfillmentStatus||"Новый")==="Отправлен"?"green":(o.fulfillmentStatus||"")==="Собран"?"sand":"neutral"}>{o.fulfillmentStatus||"Новый"}</Badge></td><td>{fmtDate(o.createdAt)}</td></tr>)}</tbody></table></div></section>{selected&&<aside className="fa-card fa-detail"><div className="fa-detail-title"><h2>Заказ #{selected.id.slice(0,8)}</h2><Badge tone={selected.status==="paid"?"green":"neutral"}>{selected.status==="paid"?"Оплачен":"Ожидает"}</Badge></div><p>{fmtDate(selected.createdAt)}</p><hr/><div className="fa-section-label">КЛИЕНТ</div><h3>{selected.customer?.name||"—"}</h3><p>{[selected.customer?.phone,selected.customer?.contactMethod,selected.customer?.contactHandle].filter(Boolean).join(" · ")}</p><div className="fa-section-label">ДОСТАВКА</div><h3>{selected.customer?.delivery||"—"}</h3><p>{[selected.customer?.address,selected.customer?.apartment,selected.customer?.postalCode].filter(Boolean).join(", ")}</p><div className="fa-section-label">СОСТАВ ЗАКАЗА</div>{selected.items?.map((i,n)=><div className="fa-order-item" key={n}>{i.img&&<img src={i.img}/>}<div><b>{i.name}</b><span>{i.qty} × {fmtMoney(i.price||0)}</span></div><b>{fmtMoney((i.price||0)*i.qty)}</b></div>)}<label className="fa-field-label">СТАТУС ИСПОЛНЕНИЯ<select value={status} onChange={e=>setStatus(e.target.value)}>{FULFILLMENT_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label><label className="fa-field-label">ТРЕК-НОМЕР<input value={track} onChange={e=>setTrack(e.target.value)} placeholder="Будет доступен после отправки"/></label><div className="fa-actions"><button className="fa-primary" onClick={save}>Сохранить изменения</button><button className="fa-outline-button" onClick={()=>navigator.clipboard?.writeText(`${selected.customer?.name||""} ${selected.customer?.phone||""}`)}><Copy size={13}/> Скопировать данные</button></div></aside>}</div></>;
}

function LeadsPage({leads,selectedId,setSelectedId,search,setSearch,token,onChanged}:{leads:Lead[];selectedId:string;setSelectedId:(x:string)=>void;search:string;setSearch:(x:string)=>void;token:string;onChanged:()=>void}){
  const [filter,setFilter]=useState<"all"|"custom"|"business">("all"); const list=leads.filter(l=>(filter==="all"||l.type===filter)&&`${l.name||""} ${l.company||""} ${l.phone||""} ${l.contact||""}`.toLowerCase().includes(search.toLowerCase())); const selected=leads.find(l=>l.id===selectedId)||list[0];
  async function readAll(){await fetch("/api/admin/leads/read-all",{method:"POST",headers:{Authorization:`Bearer ${token}`}});onChanged();} async function del(){if(!selected||!confirm("Удалить заявку?"))return;await fetch(`/api/admin/leads/${selected.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});setSelectedId("");onChanged();}
  return <><div className="fa-page-head"><div><h1>Заявки</h1><p>Брифы «На заказ» и обращения для бизнеса.</p></div><button className="fa-outline-button" onClick={readAll}>Прочитать все</button></div><div className="fa-stats"><Stat label="НОВЫЕ" value={leads.filter(l=>!l.read).length} note="непрочитанных"/><Stat label="НА ЗАКАЗ" value={leads.filter(l=>l.type==="custom").length} note="частные проекты"/><Stat label="БИЗНЕСУ" value={leads.filter(l=>l.type==="business").length} note="партнёрские запросы"/><Stat label="ЗА НЕДЕЛЮ" value={leads.filter(l=>Date.now()-new Date(l.createdAt).getTime()<604800000).length} note="всего обращений"/></div><div className="fa-toolbar"><label><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Имя, контакт или компания"/></label><div className="fa-chips"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Все</button><button className={filter==="custom"?"active":""} onClick={()=>setFilter("custom")}>На заказ</button><button className={filter==="business"?"active":""} onClick={()=>setFilter("business")}>Бизнесу</button></div></div><div className="fa-leads-split"><section className="fa-card fa-inbox"><div className="fa-inbox-head"><span>ВХОДЯЩИЕ</span><b>{leads.filter(l=>!l.read).length} новых</b></div>{list.map(l=><button key={l.id} className={`${selected?.id===l.id?"selected":""} ${!l.read?"unread":""}`} onClick={()=>setSelectedId(l.id)}><i></i><div><b>{l.type==="business"?l.company||l.name:l.name}</b><p>{l.type==="business"?(l.comment||l.inquiryType):(l.idea||"")}</p></div><div><Badge tone={l.type==="business"?"sand":"neutral"}>{l.type==="business"?"Бизнесу":"На заказ"}</Badge><small>{fmtDate(l.createdAt)}</small></div></button>)}</section>{selected&&<aside className="fa-card fa-detail"><div className="fa-section-label">ЗАЯВКА / {selected.type==="business"?"БИЗНЕСУ":"НА ЗАКАЗ"}</div><h2>{selected.type==="business"?selected.company||selected.name:selected.name}</h2><p>{fmtDate(selected.createdAt)}</p><hr/><div className="fa-section-label">КОНТАКТ</div><h3>{[selected.phone,selected.email,selected.contact].filter(Boolean).join(" · ")||"—"}</h3>{selected.budget&&<><div className="fa-section-label">БЮДЖЕТ</div><h3>{selected.budget}</h3></>}<div className="fa-section-label">ИДЕЯ</div><div className="fa-idea">{selected.type==="business"?[selected.inquiryType,selected.volume,selected.comment].filter(Boolean).join(" · "):selected.idea||"—"}</div><div className="fa-actions"><button className="fa-primary" onClick={()=>navigator.clipboard?.writeText([selected.phone,selected.email,selected.contact].filter(Boolean).join(" "))}><Copy size={13}/> Скопировать контакт</button><button className="fa-outline-button" onClick={del}>Удалить</button></div></aside>}</div></>;
}

function ProductsPage({products,search,setSearch,category,setCategory,onEdit}:{products:Product[];search:string;setSearch:(x:string)=>void;category:string;setCategory:(x:string)=>void;onEdit:(p:Product|"new")=>void}){
  const list=products.filter(p=>(category==="Все"||p.category===category)&&`${p.name} ${p.nameEn||""}`.toLowerCase().includes(search.toLowerCase())); return <><div className="fa-page-head"><div><h1>Товары</h1><p>Каталог, цены, наличие и карточки изделий.</p></div><button className="fa-primary" onClick={()=>onEdit("new")}><Plus size={14}/> Добавить товар</button></div><div className="fa-toolbar"><label><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по названию"/></label><div className="fa-chips">{["Все",...CATEGORIES,"Лимит"].map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div></div><section className="fa-card fa-table-card"><div className="fa-table-wrap"><table><thead><tr><th>ФОТО</th><th>ТОВАР</th><th>КАТЕГОРИЯ</th><th>ЦЕНА</th><th>НАЛИЧИЕ</th><th>БЕЙДЖ</th><th>ОБНОВЛЕНО</th><th></th></tr></thead><tbody>{list.map(p=><tr key={p.id}><td><img className="fa-product-mini" src={p.img}/></td><td><b>{p.name}</b><small>{p.nameEn}</small></td><td>{p.category}</td><td><b>{fmtMoney(p.price)}</b></td><td><Badge tone={p.inStock?"green":"sand"}>{p.inStock?"В наличии":p.lead||"Под заказ"}</Badge></td><td>{p.badge?<Badge tone="neutral">{p.badge}</Badge>:"—"}</td><td>{p.createdAt?new Date(p.createdAt).toLocaleDateString("ru-RU",{day:"2-digit",month:"short"}):"—"}</td><td><button className="fa-outline-button fa-small" onClick={()=>onEdit(p)}><Pencil size={13}/> Изменить</button></td></tr>)}</tbody></table></div><div className="fa-table-foot"><span>{products.length} товаров</span><span>Изменения карточки сразу попадают в витрину.</span></div></section></>;
}

function HomePage({hero,gallery,token,onChanged,onPromos}:{hero:{type?:string|null;url?:string|null;slides?:HeroSlide[]};gallery:GalleryItem[];token:string;onChanged:()=>void;onPromos:()=>void}){
  const slides=hero.slides?.length?hero.slides:(hero.url&&hero.type?[{type:hero.type as "image"|"video",url:hero.url}]:[]);const publicGallery=normalGallery(gallery);const [busy,setBusy]=useState(false);
  async function addHero(e:ChangeEvent<HTMLInputElement>){const files=Array.from(e.target.files??[]);e.target.value="";if(!files.length)return;setBusy(true);try{for(const f of [...files].reverse()){const url=await uploadFile(f,token);await fetch("/api/admin/hero",{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({type:f.type.startsWith("video/")?"video":"image",url})});}onChanged();}finally{setBusy(false)}}
  async function clearHero(){if(!confirm("Очистить всю карусель первого экрана?"))return;await fetch("/api/admin/hero",{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({type:null,url:null})});onChanged();}
  async function addGallery(e:ChangeEvent<HTMLInputElement>){const files=Array.from(e.target.files??[]);e.target.value="";if(!files.length)return;setBusy(true);try{for(const f of files){const url=await uploadFile(f,token);await fetch("/api/admin/gallery",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({url})});}onChanged();}finally{setBusy(false)}}
  async function delGallery(id:string){await fetch(`/api/admin/gallery/${id}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});onChanged();}
  return <><div className="fa-page-head"><div><h1>Главная</h1><p>Управление первым экраном витрины</p></div></div><div className="fa-home-grid"><section className="fa-card fa-hero-admin"><div className="fa-card-title"><h2>Первый экран</h2><Badge>{slides.some(s=>s.type==="video")?"Фото + видео":"Фото"}</Badge></div><div className="fa-hero-preview">{slides[0]?.type==="video"?<video src={slides[0].url} muted playsInline controls/>:slides[0]?<img src={slides[0].url}/>:<div className="fa-empty-media"><ImageIcon/><span>Заставка не загружена</span></div>}<span className="fa-media-tag">ЗАСТАВКА</span></div><div className="fa-hero-strip">{slides.map((s,i)=><div key={`${s.url}-${i}`}>{s.type==="video"?<video src={s.url} muted/>:<img src={s.url}/>}<small>{String(i+1).padStart(2,"0")} · {s.type==="video"?"Видео":"Фото"}</small></div>)}{slides.length<8&&<label className="fa-add-tile"><Plus/><input multiple type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={addHero}/></label>}</div><div className="fa-actions"><label className="fa-outline-button"><Upload size={13}/>{busy?"Загрузка…":"Добавить фото/видео"}<input multiple type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={addHero}/></label>{slides.length>0&&<button className="fa-outline-button" onClick={clearHero}><Trash2 size={13}/> Очистить</button>}</div><p className="fa-helper">Фото и видео для карусели главного экрана. Фото переключаются автоматически, а видео проигрываются полностью до конца.</p></section><section className="fa-card fa-gallery-admin"><h2>Галерея / Вдохновение</h2><div className="fa-gallery-grid">{publicGallery.slice(0,8).map(x=><div key={x.id}><img src={x.url}/><button onClick={()=>delGallery(x.id)}><X size={13}/></button><span>ФОТО</span></div>)}</div><label className="fa-outline-button fa-full"><Plus size={14}/>{busy?"Загрузка…":"Добавить фото"}<input multiple type="file" accept="image/*" onChange={addGallery}/></label><p>Обычная галерея сайта. Отдельные заставки блоков ниже управляются следующими карточками.</p></section></div><div id="satori-admin-extra-host" className="fa-extra-host"><p>Фото и видео для карусели главного экрана.</p></div><button className="fa-promo-link" onClick={onPromos}><b>Промокоды</b><span>Открыть →</span></button></>;
}

function PromosPage({promos,token,onChanged}:{promos:Promo[];token:string;onChanged:()=>void}){
  const [form,setForm]=useState({code:"",type:"percent",value:"20",applyTo:"Следующей покупке",minAmount:"0",usageLimit:"100",startsAt:"",endsAt:"",oncePerClient:true,active:true});const [error,setError]=useState("");const patch=(k:string,v:any)=>setForm(f=>({...f,[k]:v}));
  async function create(e:FormEvent){e.preventDefault();setError("");const res=await fetch("/api/admin/promocodes",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({code:form.code,type:form.type,value:Number(form.value),usageLimit:Number(form.usageLimit)||undefined,applyTo:form.applyTo,minAmount:Number(form.minAmount)||0,startsAt:form.startsAt||null,endsAt:form.endsAt||null,oncePerClient:form.oncePerClient,active:form.active})});const data=await res.json().catch(()=>({}));if(!res.ok){setError(data.error||"Не удалось создать промокод");return;}setForm(f=>({...f,code:""}));onChanged();}
  async function toggle(p:Promo){await fetch(`/api/admin/promocodes/${p.code}`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({active:!p.active})});onChanged();}async function del(p:Promo){if(!confirm(`Удалить ${p.code}?`))return;await fetch(`/api/admin/promocodes/${p.code}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});onChanged();}
  const active=promos.filter(p=>p.active).length;const used=promos.reduce((s,p)=>s+(p.usedCount||0),0);return <><div className="fa-page-head"><div><h1>Промокоды</h1><p>Скидки, подарки и персональные предложения.</p></div></div><div className="fa-promo-stats"><Stat label="АКТИВНЫЕ" value={active} note="сейчас работают"/><Stat label="ИСПОЛЬЗОВАНО" value={used} note="за всё время"/><Stat label="ИСТЕКЛИ" value={promos.filter(p=>!p.active).length} note="нужно проверить"/></div><div className="fa-promo-layout"><section className="fa-card fa-promo-list"><div className="fa-table-wrap"><table><thead><tr><th>КОД</th><th>СКИДКА</th><th>УСЛОВИЕ</th><th>ИСП.</th><th>СТАТУС</th><th></th></tr></thead><tbody>{promos.map(p=><tr key={p.code}><td><b>{p.code}</b></td><td>{p.type==="percent"?`${p.value}%`:fmtMoney(p.value)}</td><td>{p.applyTo||"—"}</td><td>{p.usedCount||0} / {p.usageLimit??"∞"}</td><td><button onClick={()=>toggle(p)}><Badge tone={p.active?"green":"neutral"}>{p.active?"Активен":"Черновик"}</Badge></button></td><td><button className="fa-icon-danger" onClick={()=>del(p)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></section><form onSubmit={create} className="fa-card fa-promo-form"><h2>Новый промокод</h2><p>Можно создать вручную или сгенерировать код.</p><div className="fa-section-label">БЫСТРЫЕ ШАБЛОНЫ</div><div className="fa-template-chips"><button type="button" onClick={()=>setForm({...form,code:"WELCOME10",type:"percent",value:"10",applyTo:"Первый заказ"})}>−10% первый заказ</button><button type="button" onClick={()=>setForm({...form,code:"SATORI20",type:"percent",value:"20",applyTo:"Следующей покупке"})}>−20% следующий</button><button type="button" onClick={()=>setForm({...form,code:"SATORI500",type:"fixed",value:"500",minAmount:"5000"})}>500 ₽ от 5000</button></div><label>КОД<div className="fa-code-row"><input required value={form.code} onChange={e=>patch("code",e.target.value.toUpperCase())}/><button type="button" className="fa-outline-button" onClick={()=>patch("code",`SATORI-${Math.random().toString(36).slice(2,7).toUpperCase()}`)}>Сгенерировать</button></div></label><div className="fa-form-grid"><label>Тип скидки<select value={form.type} onChange={e=>patch("type",e.target.value)}><option value="percent">Процент, %</option><option value="fixed">Сумма, ₽</option></select></label><label>Размер скидки<input type="number" value={form.value} onChange={e=>patch("value",e.target.value)}/></label><label className="fa-span-2">Применить к<input value={form.applyTo} onChange={e=>patch("applyTo",e.target.value)}/></label><label>Минимальная сумма<input type="number" value={form.minAmount} onChange={e=>patch("minAmount",e.target.value)}/></label><label>Лимит использований<input type="number" value={form.usageLimit} onChange={e=>patch("usageLimit",e.target.value)}/></label><label>Дата начала<input type="date" value={form.startsAt} onChange={e=>patch("startsAt",e.target.value)}/></label><label>Дата окончания<input type="date" value={form.endsAt} onChange={e=>patch("endsAt",e.target.value)}/></label></div><Toggle label="Один раз на клиента" value={form.oncePerClient} onChange={v=>patch("oncePerClient",v)}/><Toggle label="Активен сразу после сохранения" value={form.active} onChange={v=>patch("active",v)}/>{error&&<div className="fa-error">{error}</div>}<button className="fa-primary fa-full">Сохранить промокод</button></form></div></>;
}

function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <button type="button" className="fa-toggle-row" onClick={()=>onChange(!value)}><span>{label}</span><i className={value?"on":""}><b/></i></button>}

export default function AdminFigmaApp(){const [token,setToken]=useState<string|null>(()=>localStorage.getItem(TOKEN_KEY));const logout=()=>{localStorage.removeItem(TOKEN_KEY);setToken(null)};return token?<Dashboard token={token} onLogout={logout}/>:<AdminLogin onLogin={setToken}/>}
