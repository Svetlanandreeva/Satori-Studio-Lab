import { randomUUID } from "node:crypto";

const validTokens = new Set();

export function login(password) {
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD не задан в .env — вход в админку недоступен.");
  }
  if (password !== process.env.ADMIN_PASSWORD) return null;
  const token = randomUUID();
  validTokens.add(token);
  return token;
}

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !validTokens.has(token)) {
    return res.status(401).json({ error: "Не авторизован" });
  }
  next();
}
