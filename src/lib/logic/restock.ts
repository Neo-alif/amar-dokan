// Budget restock list (TRD §6). Pure, no DB, no AI: the same input always gives the same list.
import { MIN_DAYS } from "./forecast.ts";
import { matchProduct } from "./matchProduct.ts";

export const HORIZON_DAYS = 7; // buy enough for the next week…
export const SAFETY_DAYS = 2;  // …plus two days of buffer
export const FIRST_PASS_DAYS = 3; // short budget: every urgent item gets 3 days before any gets a full week

export type RestockInput = { id: string; stock: number; avg: number | null; daysLeft: number | null; cost_price: number; sell_price: number };
export type RestockLine = { id: string; qty: number; need: number; cost: number; daysLeft: number };

// within = only items that run out within this many days; cover = days of demand to buy.
export function restock(items: RestockInput[], budget: number, cover = HORIZON_DAYS + SAFETY_DAYS, within = HORIZON_DAYS) {
  const candidates = items
    .filter((p) => p.daysLeft !== null && p.daysLeft <= within && p.avg !== null && p.cost_price > 0)
    .map((p) => ({ ...p, need: Math.max(0, Math.ceil(p.avg! * cover - p.stock)) }))
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

// Young shop (< MIN_DAYS of sales): no forecast yet, so blend the shop's own daily average with the
// starter template's typical demand. w = days/14 grows to 1 as history builds; at 14+ days restock() as before.
export const YOUNG_COVER_DAYS = 4; // short horizon while demand is half guessed
export type YoungInput = RestockInput & { name_bn: string; name_en: string | null; unit: string; own_avg: number };

export function blendedDemand(own: number, template: number | null, days: number) {
  const w = Math.min(1, Math.max(0, days) / MIN_DAYS);
  return Math.round((template === null ? own : w * own + (1 - w) * template) * 100) / 100;
}

export function planRunningShop<T extends YoungInput>(rows: T[], budget: number, days: number, template: StarterItem[]) {
  if (days >= MIN_DAYS) return { ...restock(rows, budget), young: false };
  const cands = template.map((t, i) => ({ id: String(i), names: [t.name_bn, t.name_en] }));
  const blended = rows.map((p) => {
    const i = matchProduct(p.name_bn, cands) ?? (p.name_en ? matchProduct(p.name_en, cands) : null);
    const t = i !== null && template[Number(i)].unit === p.unit ? template[Number(i)] : null; // kg ≠ pcs: no match
    const avg = blendedDemand(p.own_avg, t?.daily_demand ?? null, days);
    return { ...p, avg: avg > 0 ? avg : null, daysLeft: p.stock <= 0 ? 0 : avg > 0 ? Math.round((p.stock / avg) * 100) / 100 : null };
  });
  return { ...restock(blended, budget, YOUNG_COVER_DAYS, YOUNG_COVER_DAYS), young: true };
}

// Brand-new shop, zero sales history: plan from a starter template (data/starter/*.json) instead.
export const PRIORITIES = ["essential", "normal", "optional"] as const;
export type StarterItem = {
  name_bn: string; name_en: string; unit: string; cost_price: number;
  starter_qty: number; daily_demand: number; priority: (typeof PRIORITIES)[number];
};
export type StarterLine<T extends StarterItem = StarterItem> = T & { qty: number; cost: number };

// Same two-pass greedy as restock(), one priority tier at a time: every item in the tier first gets
// FIRST_PASS_DAYS of typical demand, then tops up to starter_qty. The next tier starts only once the
// current one is fully stocked, so optional items never take money an essential still needs.
export function planNewShop<T extends StarterItem>(items: T[], budget: number) {
  let left = Math.max(0, budget);
  const qty = new Map<T, number>();
  const buy = (p: T, want: number) => {
    const q = Math.min(want, Math.floor(left / p.cost_price)); // scaled down when the budget runs short
    if (q <= 0) return;
    qty.set(p, (qty.get(p) ?? 0) + q);
    left = Math.round((left - q * p.cost_price) * 100) / 100;
  };
  for (const tier of PRIORITIES) {
    const group = items.filter((p) => p.priority === tier && p.cost_price > 0 && p.starter_qty > 0);
    for (const p of group) buy(p, Math.min(p.starter_qty, Math.max(1, Math.ceil(p.daily_demand * FIRST_PASS_DAYS))));
    for (const p of group) buy(p, p.starter_qty - (qty.get(p) ?? 0));
    if (group.some((p) => (qty.get(p) ?? 0) < p.starter_qty)) break;
  }
  const lines: StarterLine<T>[] = [...qty].map(([p, q]) => ({ ...p, qty: q, cost: Math.round(q * p.cost_price * 100) / 100 }));
  return { items: lines, total: Math.round((Math.max(0, budget) - left) * 100) / 100, remaining: left };
}
