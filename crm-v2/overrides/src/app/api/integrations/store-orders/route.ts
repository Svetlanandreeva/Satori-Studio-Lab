import { NextRequest, NextResponse } from "next/server";
import { syncStoreOrder, type StoreOrder } from "@/lib/store-orders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StoreOrder | { orders?: StoreOrder[] };
    const orders = Array.isArray((body as { orders?: StoreOrder[] }).orders)
      ? (body as { orders: StoreOrder[] }).orders
      : [body as StoreOrder];

    if (!orders.length) {
      return NextResponse.json({ error: "Нет заказов для синхронизации" }, { status: 400 });
    }

    const results = orders.map((order) => {
      try {
        return { ok: true, ...syncStoreOrder(order) };
      } catch (error) {
        return {
          ok: false,
          orderId: String(order?.id || ""),
          error: error instanceof Error ? error.message : "Ошибка синхронизации заказа",
        };
      }
    });

    const failed = results.filter((result) => !result.ok);
    return NextResponse.json(
      { ok: failed.length === 0, processed: results.length, failed: failed.length, results },
      { status: failed.length === results.length ? 500 : 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось синхронизировать заказы" },
      { status: 500 }
    );
  }
}
