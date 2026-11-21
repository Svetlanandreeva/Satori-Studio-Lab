import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { syncHomeOrder, type HomeOrder } from "@/lib/home-orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const key = process.env.SATORI_HOME_WEBHOOK_SECRET || "";
  // No shared secret configured => fail closed.
  if (key.length < 32) return NextResponse.json({ error: "Home integration disabled" }, { status: 503 });
  const timestamp = request.headers.get("x-satori-home-timestamp") || "";
  const signature = request.headers.get("x-satori-home-signature") || "";
  if (!/^\d{10,13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300000 || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = await request.text();
  if (raw.length > 13 * 1024 * 1024) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const expected = "sha256=" + createHmac("sha256", key).update(timestamp + "." + raw).digest("hex");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let order: HomeOrder;
  try { order = JSON.parse(raw) as HomeOrder; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const result = syncHomeOrder(order);
    return NextResponse.json({ ok: true, ...result }, { status: result.skipped ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка интеграции" }, { status: 400 });
  }
}
