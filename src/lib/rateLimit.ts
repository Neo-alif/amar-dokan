// shortcut: in-memory per-IP limit; resets on restart and isn't shared between server instances.
// Fine for one local/demo server; use a shared store if this ever runs on many instances.
const RATE_LIMIT = 20; // requests per minute per IP (protects the free LLM quota)
const hits = new Map<string, number[]>();

export function rateLimited(req: Request, bucket: string): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_LIMIT;
}
