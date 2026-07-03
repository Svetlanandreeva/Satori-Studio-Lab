import { randomUUID } from "node:crypto";

const API_BASE = "https://api.yookassa.ru/v3";

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error(
      "YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не заданы в .env — оплата недоступна, пока вы не добавите ключи тестового (или боевого) магазина ЮKassa."
    );
  }
  const basic = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  return `Basic ${basic}`;
}

export async function createPayment({ amount, description, returnUrl, metadata }) {
  const res = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": randomUUID(),
    },
    body: JSON.stringify({
      amount: { value: amount.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: returnUrl },
      description,
      metadata,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.description || data?.type || "Не удалось создать платёж в ЮKassa";
    throw new Error(message);
  }
  return data;
}

export async function getPayment(paymentId) {
  const res = await fetch(`${API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });
  const data = await res.json();
  if (!res.ok) {
    const message = data?.description || data?.type || "Не удалось получить статус платежа";
    throw new Error(message);
  }
  return data;
}
