// POST /api/transactions — save a transaction the owner confirmed on the ConfirmCard.
// Everything is re-validated here (the card is editable); apply_transaction recomputes all money.
import { z } from "zod";
import { METHODS, UNITS } from "@/lib/schema";
import { db, shopId } from "@/lib/db/client";
import { loadShopContext, updateAiLog } from "@/lib/db/queries";
import { matchCustomer, matchProduct } from "@/lib/logic/matchProduct";
import { MAX_INPUT_CHARS } from "@/lib/logic/normalize";

const money = z.number().nonnegative().max(10_000_000);
const Body = z.object({
  idempotency_key: z.uuid(),
  log_id: z.uuid().nullable(),
  edited: z.boolean(),
  type: z.enum(["sale", "purchase", "expense", "payment"]),
  method: z.enum(METHODS).default("cash"),
  customer_id: z.uuid().nullable(),
  customer_name: z.string().trim().max(60).nullable(),
  items: z.array(z.object({
    product_id: z.uuid().nullable(),
    name: z.string().trim().min(1).max(80),
    unit: z.enum(UNITS).nullable(),
    quantity: z.number().positive().max(100_000),
    unit_price: money,
  })).max(30),
  paid: money.nullable(),
  total: money.nullable(), // only used for expense; sale/purchase totals come from the items
  expense_category: z.string().trim().max(60).nullable(),
  raw_text: z.string().max(MAX_INPUT_CHARS).nullable(),
});

// Error codes raised inside apply_transaction (Schema §4); the UI shows the Bangla text.
const DB_CODES = [
  "CUSTOMER_REQUIRED_FOR_DUE", "CUSTOMER_REQUIRED", "PAYMENT_EXCEEDS_DUE", "PAID_EXCEEDS_TOTAL",
  "ITEMS_REQUIRED", "AMOUNT_REQUIRED", "PRODUCT_NOT_FOUND", "CUSTOMER_NOT_FOUND", "DUE_ONLY_ON_SALE",
] as const;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  const b = parsed.data;
  const shop = shopId();

  try {
    const ctx = await loadShopContext("bn");

    // Resolve the customer: given id, else match by name, else create (only when a name was given).
    let customerId = b.customer_id;
    if (!customerId && b.customer_name) {
      customerId = matchCustomer(b.customer_name, ctx.customers.map((c) => ({ id: c.id, names: [c.name] })));
      if (!customerId) {
        const { data, error } = await db().from("customers").insert({ shop_id: shop, name: b.customer_name }).select("id").single();
        if (error) throw error;
        customerId = data.id;
      }
    }

    // Resolve products the same way. shortcut: a retry after a failed save can create the same new
    // product twice (harmless, Schema §6); fine for a single-shop demo.
    const candidates = ctx.products.map((p) => ({ id: p.id, names: [p.name_bn, p.name_en ?? "", ...p.aliases] }));
    const items = [];
    for (const it of b.type === "sale" || b.type === "purchase" ? b.items : []) {
      let productId = it.product_id ?? matchProduct(it.name, candidates);
      if (!productId) {
        const price = b.type === "sale" ? { sell_price: it.unit_price } : { cost_price: it.unit_price };
        const { data, error } = await db().from("products")
          .insert({ shop_id: shop, name_bn: it.name, unit: it.unit ?? "pcs", ...price }).select("id").single();
        if (error) throw error;
        productId = data.id;
      }
      items.push({ product_id: productId, quantity: it.quantity, unit_price: it.unit_price });
    }

    // No occurred_at here: the DB stamps now(); only the seed may backdate.
    const { data: transactionId, error } = await db().rpc("apply_transaction", {
      p: {
        idempotency_key: b.idempotency_key, shop_id: shop, type: b.type, method: b.method, customer_id: customerId,
        paid: b.paid, total: b.total, items, expense_category: b.expense_category, raw_text: b.raw_text,
      },
    });
    if (error) {
      const code = DB_CODES.find((c) => error.message.includes(c));
      if (code) return Response.json({ error: code }, { status: 422 });
      throw error;
    }

    if (b.log_id) await updateAiLog(b.log_id, { status: b.edited ? "edited" : "confirmed", final: b, transaction_id: transactionId });
    return Response.json({ transaction_id: transactionId });
  } catch (e) {
    console.error("save transaction failed:", e);
    return Response.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
