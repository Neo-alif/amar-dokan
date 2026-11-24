// POST /api/products { name_bn, aliases, unit, sell_price, cost_price } — the owner adds a product by hand
// (e.g. "সয়াবিন তেল (খোলা)" in litres). Stock starts at 0: it moves only through purchases and stock counts.
import { z } from "zod";
import { db, shopId } from "@/lib/db/client";
import { UNITS } from "@/lib/schema";
import { rateLimited } from "@/lib/rateLimit";

const price = z.number().nonnegative().max(10_000_000);
const Body = z.object({
  name_bn: z.string().trim().min(1).max(80),
  aliases: z.array(z.string().trim().min(1).max(80)).max(10),
  unit: z.enum(UNITS),
  sell_price: price,
  cost_price: price,
});

export async function POST(req: Request) {
  if (rateLimited(req, "products")) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  const p = body.data;

  const { data: same, error: findError } = await db().from("products").select("id").eq("shop_id", shopId()).ilike("name_bn", p.name_bn.replace(/[%_\\]/g, "\\$&")).limit(1);
  if (findError) { console.error("product lookup failed:", findError.message); return Response.json({ error: "SERVER_ERROR" }, { status: 500 }); }
  if (same.length) return Response.json({ error: "PRODUCT_EXISTS" }, { status: 409 });

  const { data, error } = await db().from("products").insert({ shop_id: shopId(), ...p }).select("id").single();
  if (error) { console.error("product insert failed:", error.message); return Response.json({ error: "SERVER_ERROR" }, { status: 500 }); }
  return Response.json({ id: data.id });
}
