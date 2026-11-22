import { db, shopId } from "./client.ts";
import type { ShopContext } from "../ai/extract.ts";

export async function loadShopContext(lang: ShopContext["lang"]): Promise<ShopContext> {
  const shop = shopId();
  const [products, customers] = await Promise.all([
    db().from("products").select("id, name_bn, name_en, aliases, unit, sell_price").eq("shop_id", shop),
    db().from("customers").select("id, name").eq("shop_id", shop),
  ]);
  if (products.error) throw new Error(`load products: ${products.error.message}`);
  if (customers.error) throw new Error(`load customers: ${customers.error.message}`);
  return { products: products.data, customers: customers.data, lang };
}

export async function logAi(row: {
  input_text: string; lang: string; provider?: string; model?: string;
  extracted?: unknown; status: "extracted" | "failed"; latency_ms?: number;
}): Promise<string | null> {
  const { data, error } = await db().from("ai_logs").insert({ ...row, shop_id: shopId() }).select("id").single();
  if (error) { console.error("ai_logs insert failed:", error.message); return null; } // logging must not break extraction
  return data.id;
}
