import { db, shopId } from "./client.ts";
import type { ShopContext } from "../ai/extract.ts";
import { dhakaWeekStart, weeklyProfit, type SaleLine } from "../logic/summary.ts";

const one = <T>(x: T | T[]) => (Array.isArray(x) ? x[0] : x); // PostgREST embeds may come back as arrays

// Home page numbers: stat strip + weekly profit (this week and last week of sale lines).
export async function loadHomeData(now = new Date()) {
  const shop = shopId();
  const [today, customers, products] = await Promise.all([
    db().from("today_summary").select("sales, spend").eq("shop_id", shop).maybeSingle(),
    db().from("customers").select("due_balance").eq("shop_id", shop),
    db().from("products").select("stock_qty, reorder_level").eq("shop_id", shop),
  ]);
  for (const r of [today, customers, products]) if (r.error) throw new Error(`home data: ${r.error.message}`);

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
    lowStock: products.data!.filter((p) => Number(p.stock_qty) <= Number(p.reorder_level)).length,
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
