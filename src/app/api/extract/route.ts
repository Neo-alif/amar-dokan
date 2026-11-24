// POST /api/extract { text, lang } → one draft per event said (ConfirmCard / stock count card). No transaction is saved here.
import { z } from "zod";
import { extract } from "@/lib/ai/extract";
import { AllProvidersFailed } from "@/lib/ai/provider";
import { loadShopContext, logAi, updateAiLog } from "@/lib/db/queries";
import { MAX_INPUT_CHARS } from "@/lib/logic/normalize";
import { rateLimited } from "@/lib/rateLimit";

const Body = z.object({
  text: z.string().trim().min(1).max(MAX_INPUT_CHARS),
  lang: z.enum(["bn", "en"]).default("bn"),
});

export async function POST(req: Request) {
  if (rateLimited(req, "extract")) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  const { text, lang } = body.data;

  try {
    const ctx = await loadShopContext(lang);
    const r = await extract(text, ctx);
    const log_id = await logAi({
      input_text: r.input, lang, provider: r.provider, model: r.model,
      extracted: r.extracted, status: "extracted", latency_ms: r.latency_ms,
    });
    return Response.json({ drafts: r.drafts, log_id, provider: r.provider });
  } catch (e) {
    if (e instanceof AllProvidersFailed) {
      await logAi({ input_text: text, lang, status: "failed", extracted: { errors: e.attempts } });
      return Response.json({ error: "AI_UNAVAILABLE" }, { status: 503 }); // UI: manual card, clearly not AI
    }
    console.error("extract failed:", e);
    return Response.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

// PATCH /api/extract { log_id } — the owner pressed বাতিল: mark the AI draft rejected (for the edit/reject rate).
export async function PATCH(req: Request) {
  const body = z.object({ log_id: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  await updateAiLog(body.data.log_id, { status: "rejected" });
  return Response.json({ ok: true });
}
