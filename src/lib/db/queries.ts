import { db, shopId } from "./client.ts";
import type { ShopContext } from "../ai/extract.ts";
import { dhakaWeekStart, weeklyProfit, type SaleLine } from "../logic/summary.ts";
import { addDays, dailySeries, dhakaDay, forecast, stockOutlook } from "../logic/forecast.ts";

const one = <T>(x: T | T[]) => (Array.isArray(x) ? x[0] : x); // PostgREST embeds may come back as arrays

// Home page numbers: stat strip + weekly profit (this week and last week of sale lines).
export async function loadHomeData(now = new Date()) {
  const shop = shopId();
  const [today, customers, stock] = await Promise.all([
    db().from("today_summary").select("sales, spend").eq("shop_id", shop).maybeSingle(),
    db().from("customers").select("due_balance").eq("shop_id", shop),
    loadStock(now),
  ]);
  for (const r of [today, customers]) if (r.error) throw new Error(`home data: ${r.error.message}`);

  const since = new Date(dhakaWeekStart(now).getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const lines: SaleLine[] = [];
  for (let from = 0; ; from += 1000) { // PostgREST returns at most 1000 rows per request
    const { data, error } = await db().from("transaction_items")
      .select("id, quantity, unit_price, products(cost_price), transactions!inner(occurred_at, type, shop_id)")
      .eq("transactions.shop_id", shop).eq("transactions.type", "sale").gte("transactions.occurred_at", since)
      .order("id").range(from, from + 999);
    if (error) throw new Error(`sale lines: ${error.message}`);
    for (const r of data) {
      lines.push({
        occurred_at: one(r.transactions).occurred_at,
        quantity: Number(r.quantity),
        unit_price: Number(r.unit_price),
        cost_price: Number(one(r.products).cost_price),
      });
    }
    if (data.length < 1000) break;
  }

  return {
    todaySales: Number(today.data?.sales ?? 0),
    todaySpend: Number(today.data?.spend ?? 0),
    totalDue: customers.data!.reduce((s, c) => s + Number(c.due_balance), 0),
    lowStock: stock.filter((p) => p.status !== "ok").length, // same rule as /stock (forecast.ts)
    weekStart: dhakaWeekStart(now).toISOString(),
    week: weeklyProfit(lines, now),
  };
}
export type HomeData = Awaited<ReturnType<typeof loadHomeData>>;

export async function loadShopContext(lang: ShopContext["lang"]): Promise<ShopContext> {
  const shop = shopId();
  const [products, customers] = await Promise.all([
    db().from("products").select("id, name_bn, name_en, aliases, unit, sell_price, stock_qty").eq("shop_id", shop),
    db().from("customers").select("id, name, due_balance").eq("shop_id", shop),
  ]);
  if (products.error) throw new Error(`load products: ${products.error.message}`);
  if (customers.error) throw new Error(`load customers: ${customers.error.message}`);
  return { products: products.data, customers: customers.data, lang };
}

export async function updateAiLog(
  id: string,
  patch: { status: "confirmed" | "edited" | "rejected"; final?: unknown; transaction_id?: string },
): Promise<void> {
  const { error } = await db().from("ai_logs").update(patch).eq("id", id).eq("shop_id", shopId());
  if (error) console.error("ai_logs update failed:", error.message); // never block the save over a log row
}

export async function logAi(row: {
  input_text: string; lang: string; provider?: string; model?: string;
  extracted?: unknown; status: "extracted" | "failed"; latency_ms?: number;
}): Promise<string | null> {
  const { data, error } = await db().from("ai_logs").insert({ ...row, shop_id: shopId() }).select("id").single();
  if (error) { console.error("ai_logs insert failed:", error.message); return null; } // logging must not break extraction
  return data.id;
}

// Every product with its 7-day forecast, days left and status (used by /stock, home and /restock).
export async function loadStock(now = new Date()) {
  const shop = shopId();
  const today = dhakaDay(now);
  const yesterday = addDays(today, -1); // forecast from complete days only
  const { data: products, error } = await db().from("products")
    .select("id, name_bn, name_en, unit, stock_qty, reorder_level, cost_price, sell_price").eq("shop_id", shop);
  if (error) throw new Error(`products: ${error.message}`);

  const sales = new Map<string, { day: string; qty: number }[]>();
  for (let from = 0; ; from += 1000) { // PostgREST returns at most 1000 rows per request
    const { data, error } = await db().from("daily_product_sales").select("product_id, day, qty_sold")
      .eq("shop_id", shop).gte("day", addDays(today, -90)).lte("day", yesterday)
      .order("product_id").order("day").range(from, from + 999);
    if (error) throw new Error(`daily sales: ${error.message}`);
    for (const r of data) {
      if (!sales.has(r.product_id)) sales.set(r.product_id, []);
      sales.get(r.product_id)!.push({ day: r.day, qty: Number(r.qty_sold) });
    }
    if (data.length < 1000) break;
  }

  return products.map((p) => {
    const rows = sales.get(p.id) ?? [];
    const first = rows[0]?.day; // history starts at the product's first sale
    const f = first ? forecast(dailySeries(rows, first, yesterday), first) : null;
    const stock = Number(p.stock_qty), reorder = Number(p.reorder_level);
    return {
      id: p.id, name_bn: p.name_bn, name_en: p.name_en as string | null, unit: p.unit,
      stock, reorder_level: reorder, cost_price: Number(p.cost_price), sell_price: Number(p.sell_price),
      forecast: f?.daily ?? null, avg: f?.avg ?? null,
      ...stockOutlook(stock, reorder, f?.avg ?? null),
    };
  });
}
export type StockRow = Awaited<ReturnType<typeof loadStock>>[number];
