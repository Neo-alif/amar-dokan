// POST /api/money { counts: [{ account, counted }], note } — the owner's "মিলিয়ে নিন".
// The DB (count_money) reads the app's balance itself and stores counted + expected + time.
import { z } from "zod";
import { db, shopId } from "@/lib/db/client";
import { ACCOUNTS } from "@/lib/logic/money";
import { rateLimited } from "@/lib/rateLimit";

const Body = z.object({
  counts: z.array(z.object({ account: z.enum(ACCOUNTS), counted: z.number().nonnegative().max(1_000_000_000) })).min(1).max(3),
  note: z.string().trim().max(120).nullable(),
});

export async function POST(req: Request) {
  if (rateLimited(req, "money")) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success || new Set(body.data.counts.map((c) => c.account)).size !== body.data.counts.length) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  // shortcut: bank + bKash are two calls, not one DB transaction; a failure between them saves only the first.
  // Harmless (each row is a complete count on its own); merge into one RPC if counts ever need to be atomic.
  for (const c of body.data.counts) {
    const { error } = await db().rpc("count_money", { p_shop: shopId(), p_account: c.account, p_counted: c.counted, p_note: body.data.note });
    if (error) {
      console.error("count_money failed:", error.message);
      return Response.json({ error: "SERVER_ERROR" }, { status: 500 });
    }
  }
  return Response.json({ ok: true });
}
