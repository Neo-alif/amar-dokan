// লেনদেন (docs/mockup/Transactions.dc.html): period start, today's totals, rows grouped by Dhaka day. Pure, no I/O.
import { dhakaMonthStart, dhakaWeekStart } from "./summary.ts";
import { dhakaDay } from "./forecast.ts";

export const TXN_FILTERS = ["all", "sale", "purchase", "expense", "payment"] as const;
export type TxnFilter = (typeof TXN_FILTERS)[number];
export const TXN_PERIODS = ["today", "week", "month"] as const;
export type TxnPeriod = (typeof TXN_PERIODS)[number];

export type LedgerRow = { type: string; occurred_at: string; total: number; supplier_id?: string | null };

const DHAKA_OFFSET_MS = 6 * 3600 * 1000;
export const dhakaTodayStart = (now: Date) => new Date(Date.parse(dhakaDay(now)) - DHAKA_OFFSET_MS);

export function txnPeriodStart(p: TxnPeriod, now: Date): Date {
  return p === "today" ? dhakaTodayStart(now) : p === "week" ? dhakaWeekStart(now) : dhakaMonthStart(now);
}

// আজ বিক্রি (sales, count of all entries) · আজ খরচ ও কেনা (purchases + expenses) · আজ জমা (customer payments only).
export function todayTotals(rows: LedgerRow[], now: Date) {
  const start = dhakaTodayStart(now).getTime();
  const today = rows.filter((r) => Date.parse(r.occurred_at) >= start);
  const sum = (f: (r: LedgerRow) => boolean) => Math.round(today.filter(f).reduce((s, r) => s + r.total, 0) * 100) / 100;
  return {
    sales: sum((r) => r.type === "sale"),
    count: today.length,
    spend: sum((r) => r.type === "purchase" || r.type === "expense"),
    collected: sum((r) => r.type === "payment" && !r.supplier_id),
  };
}

// Newest day first, newest entry first inside a day.
export function groupByDay<T extends LedgerRow>(rows: T[], filter: TxnFilter) {
  const days = new Map<string, T[]>();
  for (const r of [...rows].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))) {
    if (filter !== "all" && r.type !== filter) continue;
    const d = dhakaDay(new Date(r.occurred_at));
    if (!days.has(d)) days.set(d, []);
    days.get(d)!.push(r);
  }
  return [...days].map(([day, items]) => ({ day, items }));
}

// Customer ledger with the due after each entry ("running due"), newest first. Starts from 0 at the oldest entry.
export function withRunningDue<T extends { at: string; change: number }>(entries: T[]) {
  let due = 0;
  return [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((e) => ({ ...e, due: (due = Math.round((due + e.change) * 100) / 100) }))
    .reverse();
}
