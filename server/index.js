import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { createPayment, getPayment } from "./yookassa.js";
import { createOrder, getOrder, updateOrder, listOrders } from "./orders.js";
import { listProducts, createProduct, updateProduct, deleteProduct } from "./products.js";
import { login, requireAdmin } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env"), quiet: true });

const UPLOADS_DIR = path.join(__dirname, "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error("Разрешены только изображения (JPEG, PNG, WEBP, GIF)"));
    }
    cb(null, true);
  },
});

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ── Создание заказа + платежа ───────────────────────────────────────────────
app.post("/api/checkout", async (req, res) => {
  try {
    const { items, customer } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Корзина пуста" });
    }
    if (!customer?.name || !customer?.phone) {
      return res.status(400).json({ error: "Укажите имя и телефон" });
    }

    const amount = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const orderId = randomUUID();

    const order = {
      id: orderId,
      items,
      customer,
      amount,
      status: "pending_payment",
      fulfillmentStatus: "Новый",
      paymentId: null,
      createdAt: new Date().toISOString(),
    };
    await createOrder(order);

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
      } else if (payment.status === "canceled") {
        await updateOrder(order.id, { status: "canceled" });
        order.status = "canceled";
      }
    }

    res.json({ status: order.status, amount: order.amount });
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
        await updateOrder(orderId, { status: "paid" });
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

// ── Товары (публичный список для витрины) ───────────────────────────────────
app.get("/api/products", async (req, res) => {
  try {
    res.json(await listProducts());
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
    const { fulfillmentStatus } = req.body;
    const order = await updateOrder(req.params.id, { fulfillmentStatus });
    if (!order) return res.status(404).json({ error: "Заказ не найден" });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.listen(PORT, () => {
  console.log(`Satori backend listening on http://localhost:${PORT}`);
});
