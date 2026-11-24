// POST /api/stock-count — save a stock count the owner confirmed ("চাল ৪০ কেজি আছে").
// apply_stock_count (migration 004) sets stock to the counted qty and writes an 'adjust' movement;
// the change is computed in the DB, never taken from the client or the LLM.
import { z } from "zod";
import { MAX_DAYS_AGO } from "@/lib/schema";
import { db, shopId } from "@/lib/db/client";
import { updateAiLog } from "@/lib/db/queries";
import { entryKey, occurredAt } from "@/lib/logic/entries";

const Body = z.object({
  batch_key: z.uuid(),
  index: z.number().int().min(0).max(9),
  log_id: z.uuid().nullable(),
  product_id: z.uuid(),
  counted: z.number().nonnegative().max(100_000),
  days_ago: z.number().int().min(0).max(MAX_DAYS_AGO).default(0),
});

const DB_CODES = ["BAD_COUNT", "PRODUCT_NOT_FOUND"] as const;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  const b = parsed.data;
  try {
    const { data: change, error } = await db().rpc("apply_stock_count", {
      p_shop: shopId(), p_product: b.product_id, p_counted: b.counted,
      p_key: entryKey(b.batch_key, b.index), p_at: occurredAt(b.days_ago) ?? undefined,
    });
    if (error) {
      const code = DB_CODES.find((c) => error.message.includes(c));
      if (code) return Response.json({ error: code }, { status: 422 });
      throw error;
    }
    // shortcut: ai_logs has one transaction_id, so a multi-event message logs only its status here
    if (b.log_id) await updateAiLog(b.log_id, { status: "confirmed" });
    return Response.json({ change });
  } catch (e) {
    console.error("save stock count failed:", e);
    return Response.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
