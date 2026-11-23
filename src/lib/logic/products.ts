// পণ্য (docs/mockup/Products.dc.html): margin per product and the list's sort orders. Pure, no I/O.
export const PRODUCT_SORTS = ["best", "worst", "margin", "name"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

// লাভ % on the selling price: (বিক্রয় − কেনা) ÷ বিক্রয়. null when there is no selling price.
export const marginPct = (sell: number, cost: number) => (sell > 0 ? Math.round(((sell - cost) / sell) * 100) : null);

export function sortProducts<T extends { name: string; weekQty: number; sell_price: number; cost_price: number }>(rows: T[], by: ProductSort, locale: string) {
  const m = (p: T) => marginPct(p.sell_price, p.cost_price) ?? -Infinity;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, locale);
  return [...rows].sort((a, b) =>
    by === "best" ? b.weekQty - a.weekQty || byName(a, b)
    : by === "worst" ? a.weekQty - b.weekQty || byName(a, b)
    : by === "margin" ? m(b) - m(a) || byName(a, b)
    : byName(a, b));
}
