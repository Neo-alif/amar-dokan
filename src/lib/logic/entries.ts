// Server-only helpers for saving the entries of one message (uses node:crypto; never import from the browser).
import { createHash } from "node:crypto";

// days_ago said by the owner → occurred_at. Dhaka is fixed UTC+6 (no DST), so N × 24 h back is exactly
// N Dhaka calendar days earlier at the same clock time. 0 → null: the DB stamps now().
export function occurredAt(daysAgo: number, now = new Date()): string | null {
  return daysAgo > 0 ? new Date(now.getTime() - daysAgo * 86_400_000).toISOString() : null;
}

// One idempotency key per entry: batchKey:index → a stable uuid (the DB key columns are uuid).
// A retry of the same card sends the same batch_key + index, so it can never save twice.
export function entryKey(batchKey: string, index: number): string {
  const h = createHash("sha256").update(`${batchKey}:${index}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
