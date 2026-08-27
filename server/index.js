import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { createPayment, getPayment } from "./yookassa.js";
import { createOrder, getOrder, updateOrder, listOrders, findOrderByCode } from "./orders.js";
import { listProducts, createProduct, updateProduct, deleteProduct } from "./products.js";
import { login, requireAdmin } from "./auth.js";
import { sendVkMessage } from "./vk.js";
import { listGallery, addGalleryPhoto, removeGalleryPhoto } from "./gallery.js";
import { listPromoCodes, getPromoCode, createPromoCode, updatePromoCode, deletePromoCode, isPromoUsable, computeDiscount } from "./promocodes.js";
import { createLead, listLeads, deleteLead, markAllLeadsRead } from "./leads.js";
import { getHero, setHero } from "./hero.js";
import { sendOfflineConversion } from "./metrika.js";
import { createImageResizeRoute } from "./imageResize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env"), quiet: true });

const UPLOADS_DIR = path.join(__dirname, "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.mimetype)) {
      return cb(new Error("Разрешены только изображения (JPEG, PNG, WEBP, GIF) и видео (MP4, WEBM, MOV)"));
    }
    cb(null, true);
  },
});

const app = express();
app.use(cors());
app.use(express.json());
app.get("/uploads/:file", createImageResizeRoute(UPLOADS_DIR));
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "1y", immutable: true }));

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

async function notifyOwnerPaid(order) {
  const handle = process.env.ADMIN_VK_HANDLE;
  if (!handle) return;
  const code = order.id.slice(0, 8);
  const items = (order.items || []).map((i) => `${i.name} ×${i.qty}`).join(", ");
  const message = `Новый оплаченный заказ Satori №${code}\nСумма: ${order.amount}₽\nТовары: ${items}\nКлиент: ${order.customer?.name}, ${order.customer?.phone}`;
  try {
    await sendVkMessage(handle, message);
  } catch (err) {
    console.error("Owner VK notify failed:", err.message);
  }
}

async function notifyOwnerLead(lead) {
  const handle = process.env.ADMIN_VK_HANDLE;
  if (!handle) return;
  const message = lead.type === "business"
    ? `Новая заявка «Бизнесу» на Satori\nКомпания: ${lead.company}\nКонтакт: ${lead.name}, ${lead.contact}\nТип: ${lead.inquiryType || "—"}\nОбъём: ${lead.volume || "—"}\nКомментарий: ${lead.comment || "—"}`
    : `Новый бриф «На заказ» на Satori\nИмя: ${lead.name}\nКонтакт: ${lead.contact}\nБюджет: ${lead.budget || "—"}\nИдея: ${lead.idea || "—"}`;
  try {
    await sendVkMessage(handle, message);
  } catch (err) {
    console.error("Owner VK lead notify failed:", err.message);
  }
}

// Отправляет офлайн-конверсию в Метрику один раз на заказ — подстраховка на
// случай, если клиентский reachGoal() не успел сработать (браузер закрыт и т.п.)
async function sendMetrikaOfflineIfNeeded(order) {
  if (!order || order.metrikaOfflineSent) return;
  try {
    await sendOfflineConversion(order);
    await updateOrder(order.id, { metrikaOfflineSent: true });
  } catch (err) {
    console.error("Metrika offline-conversion failed:", err.message);
  }
}

// ── Создание заказа + платежа ───────────────────────────────────────────────
app.post("/api/checkout", async (req, res) => {
  try {
    const { items, customer, promoCode, tracking } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Корзина пуста" });
    }
    if (!customer?.name || !customer?.phone) {
      return res.status(400).json({ error: "Укажите имя и телефон" });
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    let amount = subtotal;
    let discount = 0;
    let appliedPromo = null;
    if (promoCode) {
      const promo = await getPromoCode(promoCode);
      if (promo && isPromoUsable(promo)) {
        discount = computeDiscount(promo, subtotal);
        amount = subtotal - discount;
        appliedPromo = promo.code;
      }
    }
    const orderId = randomUUID();

    const order = {
      id: orderId,
      items,
      customer,
      amount,
      subtotal,
      discount,
      promoCode: appliedPromo,
      status: "pending_payment",
      fulfillmentStatus: "Новый",
      paymentId: null,
      createdAt: new Date().toISOString(),
      yclid: tracking?.yclid || undefined,
      clientId: tracking?.clientId || undefined,
      metrikaOfflineSent: false,
    };
    await createOrder(order);
    if (appliedPromo) {
      const promo = await getPromoCode(appliedPromo);
      await updatePromoCode(appliedPromo, { usedCount: (promo?.usedCount ?? 0) + 1 });
    }

    const payment = await createPayment({
      amount,
      description: `Заказ Satori №${orderId.slice(0, 8)}`,
      returnUrl: `${FRONTEND_URL}/?orderId=${orderId}`,
      metadata: { orderId },
    });

    await updateOrder(orderId, { paymentId: payment.id });

    res.json({
      orderId,
      confirmationUrl: payment.confirmation.confirmation_url,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Ошибка сервера" });
  }
});

// ── Статус заказа (поллинг после возврата с оплаты) ─────────────────────────
app.get("/api/orders/:id/status", async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Заказ не найден" });

    if (order.paymentId && order.status === "pending_payment") {
      const payment = await getPayment(order.paymentId);
      if (payment.status === "succeeded") {
        await updateOrder(order.id, { status: "paid" });
        order.status = "paid";
        notifyOwnerPaid(order);
        sendMetrikaOfflineIfNeeded(order);
      } else if (payment.status === "canceled") {
        await updateOrder(order.id, { status: "canceled" });
        order.status = "canceled";
      }
    }

    res.json({ status: order.status, amount: order.amount, items: order.items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Ошибка сервера" });
  }
});

// ── Отслеживание заказа по короткому коду (публичное, без ПД покупателя) ────
app.get("/api/orders/track/:code", async (req, res) => {
  try {
    const order = await findOrderByCode(req.params.code);
    if (!order) return res.status(404).json({ error: "Заказ не найден — проверьте код" });
    res.json({
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus ?? "Новый",
      trackingCode: order.trackingCode ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Ошибка сервера" });
  }
});

// ── Вебхук ЮKassa (для боевого режима, когда сайт будет опубликован) ────────
app.post("/api/yookassa/webhook", async (req, res) => {
  try {
    const event = req.body;
    const orderId = event?.object?.metadata?.orderId;
    if (orderId) {
      if (event.event === "payment.succeeded") {
        const existing = await getOrder(orderId);
        const wasAlreadyPaid = existing?.status === "paid";
        const updated = await updateOrder(orderId, { status: "paid" });
        if (!wasAlreadyPaid && updated) notifyOwnerPaid(updated);
        if (!wasAlreadyPaid && updated) sendMetrikaOfflineIfNeeded(updated);
      } else if (event.event === "payment.canceled") {
        await updateOrder(orderId, { status: "canceled" });
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200); // ЮKassa ожидает 200 даже при внутренних ошибках, иначе будет ретраить бесконечно
  }
});

// ── Заявки (бриф «На заказ» и «Бизнесу») ────────────────────────────────────
app.post("/api/leads", async (req, res) => {
  try {
    const { type, ...fields } = req.body;
    if (type !== "custom" && type !== "business") {
      return res.status(400).json({ error: "Некорректный тип заявки" });
    }
    if (type === "custom" && !fields.name) {
      return res.status(400).json({ error: "Укажите имя" });
    }
    if (type === "business" && (!fields.company || !fields.name || !fields.contact)) {
      return res.status(400).json({ error: "Заполните обязательные поля" });
    }
    const lead = await createLead({ type, ...fields });
    notifyOwnerLead(lead);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/admin/leads", requireAdmin, async (req, res) => {
  try {
    const leads = await listLeads();
    res.json(leads.slice().reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.delete("/api/admin/leads/:id", requireAdmin, async (req, res) => {
  try {
    await deleteLead(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/admin/leads/read-all", requireAdmin, async (req, res) => {
  try {
    await markAllLeadsRead();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ── Товары (публичный список для витрины) ───────────────────────────────────
app.get("/api/products", async (req, res) => {
  try {
    res.json(await listProducts());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ── Галерея (публичная витрина + управление в админке) ──────────────────────
app.get("/api/gallery", async (req, res) => {
  try {
    res.json(await listGallery());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/admin/gallery", requireAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Не передан url фото" });
    res.json(await addGalleryPhoto(url));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.delete("/api/admin/gallery/:id", requireAdmin, async (req, res) => {
  try {
    const ok = await removeGalleryPhoto(req.params.id);
    if (!ok) return res.status(404).json({ error: "Фото не найдено" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ── Хиро-медиа (публичный просмотр + управление в админке) ──────────────────
app.get("/api/hero", async (req, res) => {
  try {
    res.json(await getHero());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.put("/api/admin/hero", requireAdmin, async (req, res) => {
  try {
    const { type, url } = req.body;
    if (type !== null && type !== "image" && type !== "video") {
      return res.status(400).json({ error: "Некорректный тип медиа" });
    }
    if (type && !url) return res.status(400).json({ error: "Не передан url файла" });
    res.json(await setHero({ type, url: type ? url : null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ── Промокоды (проверка — публично, управление — в админке) ─────────────────
app.post("/api/promocodes/validate", async (req, res) => {
  try {
    const { code, amount } = req.body;
    if (!code) return res.status(400).json({ error: "Введите промокод" });
    const promo = await getPromoCode(code);
    if (!promo || !isPromoUsable(promo)) {
      return res.status(404).json({ error: "Промокод не найден или больше не действует" });
    }
    const discount = computeDiscount(promo, Number(amount) || 0);
    res.json({ code: promo.code, type: promo.type, value: promo.value, discount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/api/admin/promocodes", requireAdmin, async (req, res) => {
  try {
    res.json(await listPromoCodes());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/admin/promocodes", requireAdmin, async (req, res) => {
  try {
    res.json(await createPromoCode(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message || "Не удалось создать промокод" });
  }
});

app.put("/api/admin/promocodes/:code", requireAdmin, async (req, res) => {
  try {
    const promo = await updatePromoCode(req.params.code, req.body);
    if (!promo) return res.status(404).json({ error: "Промокод не найден" });
    res.json(promo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.delete("/api/admin/promocodes/:code", requireAdmin, async (req, res) => {
  try {
    const ok = await deletePromoCode(req.params.code);
    if (!ok) return res.status(404).json({ error: "Промокод не найден" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ── Вход в админку ────────────────────────────────────────────────────────
app.post("/api/admin/login", (req, res) => {
  try {
    const token = login(req.body?.password);
    if (!token) return res.status(401).json({ error: "Неверный пароль" });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message || "Ошибка сервера" });
  }
});

// ── Загрузка фото товара (требует авторизации) ───────────────────────────────
app.post("/api/admin/upload", requireAdmin, (req, res) => {
  upload.single("photo")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Не удалось загрузить файл" });
    if (!req.file) return res.status(400).json({ error: "Файл не выбран" });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

// ── Управление товарами (требует авторизации) ───────────────────────────────
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const product = await createProduct(req.body);
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const product = await updateProduct(Number(req.params.id), req.body);
    if (!product) return res.status(404).json({ error: "Товар не найден" });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const ok = await deleteProduct(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: "Товар не найден" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ── Заказы в админке ─────────────────────────────────────────────────────────
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const orders = await listOrders();
    res.json(orders.slice().reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  try {
    const { fulfillmentStatus, trackingCode } = req.body;
    const patch = {};
    if (fulfillmentStatus !== undefined) patch.fulfillmentStatus = fulfillmentStatus;
    if (trackingCode !== undefined) patch.trackingCode = trackingCode;
    const order = await updateOrder(req.params.id, patch);
    if (!order) return res.status(404).json({ error: "Заказ не найден" });
    res.json(order);

    if (fulfillmentStatus && order.customer?.contactMethod === "ВКонтакте" && order.customer?.contactHandle) {
      const code = order.id.slice(0, 8);
      let message = `Заказ Satori №${code}: статус изменён на «${fulfillmentStatus}».`;
      if (fulfillmentStatus === "Отправлен" && order.trackingCode) {
        message += ` Трек-номер отправления: ${order.trackingCode}.`;
      }
      sendVkMessage(order.customer.contactHandle, message).catch((err) => {
        console.error("VK notify failed:", err.message);
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.listen(PORT, () => {
  console.log(`Satori backend listening on http://localhost:${PORT}`);
});
