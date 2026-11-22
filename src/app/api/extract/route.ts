// POST /api/extract { text, lang } → draft transaction for the ConfirmCard. No transaction is saved here.
import { z } from "zod";
import { extract } from "@/lib/ai/extract";
import { AllProvidersFailed } from "@/lib/ai/provider";
import { loadShopContext, logAi } from "@/lib/db/queries";
import { MAX_INPUT_CHARS } from "@/lib/logic/normalize";

const Body = z.object({
  text: z.string().trim().min(1).max(MAX_INPUT_CHARS),
  lang: z.enum(["bn", "en"]).default("bn"),
});

// shortcut: in-memory per-IP limit; resets on restart and isn't shared between server instances.
// Fine for one local/demo server; use a shared store if this ever runs on many instances.
const RATE_LIMIT = 20;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

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
    return Response.json({ draft: r.draft, log_id, provider: r.provider });
  } catch (e) {
    if (e instanceof AllProvidersFailed) {
      await logAi({ input_text: text, lang, status: "failed", extracted: { errors: e.attempts } });
      return Response.json({ error: "AI_UNAVAILABLE" }, { status: 503 }); // UI: manual card, clearly not AI
    }
    console.error("extract failed:", e);
    return Response.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
