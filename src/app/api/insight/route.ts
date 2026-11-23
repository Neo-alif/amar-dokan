// POST /api/insight { lang } → verified month/today numbers + AI wording (number-checked). Read-only.
import { z } from "zod";
import { insight } from "@/lib/ai/insight";
import { loadInsightNumbers } from "@/lib/db/queries";
import { rateLimited } from "@/lib/rateLimit";

const Body = z.object({ lang: z.enum(["bn", "en"]).default("bn") });

export async function POST(req: Request) {
  if (rateLimited(req, "insight")) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const numbers = await loadInsightNumbers();
    const text = await insight(numbers, body.data.lang, req.signal);
    return Response.json({ numbers, ...text });
  } catch (e) {
    console.error("insight failed:", e);
    return Response.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
