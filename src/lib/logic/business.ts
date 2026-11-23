// ব্যবসার অবস্থা (docs/mockup/Business.dc.html): balance sheet + profit & loss for a period. Pure, no I/O.
// Accounting rules (one place, so nothing is counted twice):
// - Revenue = sale lines only, full price, even the part left as baki (a credit sale raises পাওনা, not cash).
// - A customer payment (বাকি আদায়) is not revenue; a purchase is stock (an asset), not an expense;
//   a supplier payment (দেনা শোধ) only lowers দেনা. Expenses = `expense` transactions only.
// - COGS uses today's cost price (same shortcut as summary.ts weeklyProfit).
import { byProduct, dhakaMonthStart, type SaleLine } from "./summary.ts";
import { addDays, dhakaDay } from "./forecast.ts";

export const PERIODS = ["7d", "30d", "month"] as const;
export type Period = (typeof PERIODS)[number];
export type Txn = { type: string; occurred_at: string; total: number; expense_category?: string | null };

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3600 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const dhakaMidnight = (day: string) => Date.parse(day) - DHAKA_OFFSET_MS;

// [start, end) of the period up to now, the same-length period before it, and its Dhaka days.
export function periodRange(p: Period, now: Date) {
  const today = dhakaDay(now);
  const end = now.getTime() + 1;
  const start = p === "month" ? dhakaMonthStart(now).getTime() : dhakaMidnight(addDays(today, p === "7d" ? -6 : -29));
  const prevStart = p === "month" ? dhakaMonthStart(now, -1).getTime() : start - (p === "7d" ? 7 : 30) * DAY_MS;
  const prevEnd = Math.min(prevStart + (end - start), start); // same point of the previous period
  const days: string[] = [];
  for (let d = dhakaDay(new Date(start)); d <= today; d = addDays(d, 1)) days.push(d);
  return { start, end, prevStart, prevEnd, days };
}

const inRange = (iso: string, start: number, end: number) => { const t = Date.parse(iso); return t >= start && t < end; };

// লাভ-ক্ষতি: মোট লাভ = বিক্রি − কেনা দাম; নিট লাভ = মোট লাভ − খরচ; মার্জিন = নিট লাভ ÷ বিক্রি.
export function profitAndLoss(lines: SaleLine[], txns: Txn[], start: number, end: number) {
  let revenue = 0, cogs = 0;
  for (const l of lines) {
    if (!inRange(l.occurred_at, start, end)) continue;
    revenue += l.unit_price * l.quantity;
    cogs += l.cost_price * l.quantity;
  }
  const expenses = txns.filter((x) => x.type === "expense" && inRange(x.occurred_at, start, end)).reduce((s, x) => s + x.total, 0);
  const gross = revenue - cogs, net = gross - expenses;
  return {
    revenue: r2(revenue), cogs: r2(cogs), gross: r2(gross), expenses: r2(expenses), net: r2(net),
    marginPct: revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : null,
  };
}

// সম্পদ ও দায়: নিট ওয়ার্থ = হাতে থাকা টাকা + পাওনা + মালের দাম − দেনা (an estimate, not cash).
export function businessPosition(x: {
  cash: number; bank: number; bkash: number; receivable: number; payable: number; stock: { qty: number; cost: number }[];
}) {
  const available = r2(x.cash + x.bank + x.bkash);
  const inventory = r2(x.stock.reduce((s, p) => s + Math.max(0, p.qty) * p.cost, 0)); // negative stock is a data error, not value
  return { available, receivable: x.receivable, payable: x.payable, inventory, netWorth: r2(available + x.receivable + inventory - x.payable) };
}

// Chart data for the period.
export function dailySales(lines: SaleLine[], days: string[]) {
  const m = new Map(days.map((d) => [d, 0]));
  for (const l of lines) {
    const d = dhakaDay(new Date(l.occurred_at));
    if (m.has(d)) m.set(d, m.get(d)! + l.unit_price * l.quantity);
  }
  return days.map((day) => ({ day, sales: r2(m.get(day)!) }));
}

export function expenseBreakdown(txns: Txn[], start: number, end: number, other: string) {
  const m = new Map<string, number>();
  for (const x of txns) {
    if (x.type !== "expense" || !inRange(x.occurred_at, start, end)) continue;
    const k = x.expense_category?.trim() || other;
    m.set(k, (m.get(k) ?? 0) + x.total);
  }
  return [...m].map(([category, total]) => ({ category, total: r2(total) })).sort((a, b) => b.total - a.total);
}

export const topProducts = (lines: SaleLine[], start: number, end: number, n = 5) =>
  [...byProduct(lines, start, end)].sort((a, b) => b[1].sales - a[1].sales).slice(0, n)
    .map(([id, p]) => ({ id, sales: r2(p.sales), profit: r2(p.profit) }));

// খরচ page: this month (expenses only, never purchases), the whole of last month, and expenses as a share of this month's sales.
export function expenseMonth(txns: Txn[], now: Date) {
  const start = dhakaMonthStart(now).getTime(), prev = dhakaMonthStart(now, -1).getTime(), end = now.getTime() + 1;
  const sum = (type: string, a: number, b: number) =>
    r2(txns.filter((x) => x.type === type && inRange(x.occurred_at, a, b)).reduce((s, x) => s + x.total, 0));
  const month = sum("expense", start, end), sales = sum("sale", start, end);
  return {
    month, lastMonth: sum("expense", prev, start),
    salesPct: sales > 0 ? Math.round((month / sales) * 1000) / 10 : null,
    byCategory: expenseBreakdown(txns, start, end, ""),
  };
}
