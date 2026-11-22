// Budget restock list (TRD §6). Pure, no DB, no AI: the same input always gives the same list.
export const HORIZON_DAYS = 7; // buy enough for the next week…
export const SAFETY_DAYS = 2;  // …plus two days of buffer
export const FIRST_PASS_DAYS = 3; // short budget: every urgent item gets 3 days before any gets a full week

export type RestockInput = { id: string; stock: number; avg: number | null; daysLeft: number | null; cost_price: number; sell_price: number };
export type RestockLine = { id: string; qty: number; need: number; cost: number; daysLeft: number };

export function restock(items: RestockInput[], budget: number) {
  const candidates = items
    .filter((p) => p.daysLeft !== null && p.daysLeft <= HORIZON_DAYS && p.avg !== null && p.cost_price > 0)
    .map((p) => ({ ...p, need: Math.max(0, Math.ceil(p.avg! * (HORIZON_DAYS + SAFETY_DAYS) - p.stock)) }))
    .filter((p) => p.need > 0)
    // runs out first → first; same day → bigger margin first
    .sort((a, b) => a.daysLeft! - b.daysLeft! || (b.sell_price - b.cost_price) - (a.sell_price - a.cost_price));

  // Greedy in two passes so one product can't eat the whole budget:
  // pass 1 gives every urgent item FIRST_PASS_DAYS of stock, pass 2 tops up to the full need.
  let left = Math.max(0, budget);
  const qty = new Map<string, number>();
  const buy = (p: (typeof candidates)[number], want: number) => {
    const q = Math.min(want, Math.floor(left / p.cost_price)); // partial qty when the budget runs short
    if (q <= 0) return;
    qty.set(p.id, (qty.get(p.id) ?? 0) + q);
    left = Math.round((left - q * p.cost_price) * 100) / 100;
  };
  for (const p of candidates) buy(p, Math.min(p.need, Math.max(0, Math.ceil(p.avg! * FIRST_PASS_DAYS - p.stock))));
  for (const p of candidates) buy(p, p.need - (qty.get(p.id) ?? 0));

  const lines: RestockLine[] = candidates.filter((p) => qty.has(p.id)).map((p) => ({
    id: p.id, qty: qty.get(p.id)!, need: p.need, daysLeft: p.daysLeft!,
    cost: Math.round(qty.get(p.id)! * p.cost_price * 100) / 100,
  }));
  const skipped = candidates.filter((p) => !qty.has(p.id)).map((p) => p.id);
  return { lines, skipped, spent: Math.round((Math.max(0, budget) - left) * 100) / 100, left };
}
