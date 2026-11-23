// Deterministic shop numbers for the home page (TRD §6 "Weekly status"). All days are Asia/Dhaka.
const DHAKA_OFFSET_MS = 6 * 3600 * 1000; // Bangladesh has no DST
const DAY_MS = 24 * 3600 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

// Start (as a UTC instant) of the Dhaka shop week — Saturday 00:00 — that contains `now`.
export function dhakaWeekStart(now: Date): Date {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const daysSinceSaturday = (local.getUTCDay() + 1) % 7; // Sat→0, Sun→1 … Fri→6
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceSaturday);
  return new Date(startLocal - DHAKA_OFFSET_MS);
}

export type SaleLine = { occurred_at: string; quantity: number; unit_price: number; cost_price: number; product_id?: string };

// Profit = Σ (sell price − current cost price) × qty. shortcut: uses today's cost price, not the
// price paid at purchase time (known MVP limitation, TRD §6); upgrade by storing cost per sale line.
export function weeklyProfit(lines: SaleLine[], now: Date) {
  const start = dhakaWeekStart(now).getTime();
  const prevStart = start - 7 * DAY_MS;
  const daily = [0, 0, 0, 0, 0, 0, 0]; // Sat … Fri, this week
  let sales = 0, cost = 0, lastWeek = 0;
  for (const l of lines) {
    const t = Date.parse(l.occurred_at);
    const profit = (l.unit_price - l.cost_price) * l.quantity;
    if (t >= start && t <= now.getTime()) {
      daily[Math.floor((t - start) / DAY_MS)] += profit;
      sales += l.unit_price * l.quantity;
      cost += l.cost_price * l.quantity;
    } else if (t >= prevStart && t <= now.getTime() - 7 * DAY_MS) {
      lastWeek += profit; // same point last week, so a Sunday isn't compared with a whole week
    }
  }
  const profit = r2(sales - cost);
  return {
    profit,
    lastWeek: r2(lastWeek),
    changePct: lastWeek > 0 ? Math.round(((profit - lastWeek) / lastWeek) * 100) : null, // no base → no %
    sales: r2(sales),
    cost: r2(cost),
    daily: daily.map(r2),
    todayIndex: Math.floor((now.getTime() - start) / DAY_MS),
  };
}

const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

// Start (UTC instant) of a Dhaka calendar month; offset −1 = previous month.
export function dhakaMonthStart(now: Date, offset = 0): Date {
  const l = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + offset, 1) - DHAKA_OFFSET_MS);
}

// Per-product sales/profit/qty for lines with start ≤ t < end.
export function byProduct(lines: SaleLine[], start: number, end: number) {
  const m = new Map<string, { sales: number; profit: number; qty: number }>();
  for (const l of lines) {
    const t = Date.parse(l.occurred_at);
    if (t < start || t >= end || !l.product_id) continue;
    const p = m.get(l.product_id) ?? { sales: 0, profit: 0, qty: 0 };
    p.sales += l.unit_price * l.quantity;
    p.profit += (l.unit_price - l.cost_price) * l.quantity;
    p.qty += l.quantity;
    m.set(l.product_id, p);
  }
  return m;
}
const total = (m: Map<string, { sales: number; profit: number }>, k: "sales" | "profit") =>
  r2([...m.values()].reduce((a, p) => a + p[k], 0));

// This calendar month vs the same point of last month (a partial month is never compared with a full one).
export function monthSummary(lines: SaleLine[], spend: { occurred_at: string; total: number }[], now: Date) {
  const start = dhakaMonthStart(now).getTime(), prevStart = dhakaMonthStart(now, -1).getTime();
  const end = now.getTime() + 1, prevEnd = Math.min(prevStart + (end - start), start);
  const cur = byProduct(lines, start, end), prev = byProduct(lines, prevStart, prevEnd);
  const spendIn = (a: number, b: number) =>
    r2(spend.reduce((s, r) => { const t = Date.parse(r.occurred_at); return t >= a && t < b ? s + r.total : s; }, 0));
  const sales = total(cur, "sales"), profit = total(cur, "profit"), lastMonthSales = total(prev, "sales");
  return {
    monthStart: new Date(start).toISOString(),
    sales, profit, spend: spendIn(start, end),
    marginPct: sales > 0 ? Math.round((profit / sales) * 1000) / 10 : null,
    lastMonthSales, lastMonthProfit: total(prev, "profit"), lastMonthSpend: spendIn(prevStart, prevEnd),
    salesChangePct: pct(sales, lastMonthSales),
    top5: [...cur].sort((a, b) => b[1].sales - a[1].sales).slice(0, 5)
      .map(([id, p]) => ({ id, sales: r2(p.sales), profit: r2(p.profit) })),
    bottom3: [...cur].sort((a, b) => a[1].profit - b[1].profit).slice(0, 3) // lowest profit this month (may be a loss)
      .map(([id, p]) => ({ id, sales: r2(p.sales), profit: r2(p.profit) })),
  };
}

// Today so far vs yesterday up to the same time; top 3 products by qty today.
export function todayNumbers(lines: SaleLine[], now: Date) {
  const l = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const start = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - DHAKA_OFFSET_MS;
  const end = now.getTime() + 1;
  const today = byProduct(lines, start, end), yest = byProduct(lines, start - DAY_MS, end - DAY_MS);
  const sales = total(today, "sales"), yesterdaySameTime = total(yest, "sales");
  return {
    sales, yesterdaySameTime, changePct: pct(sales, yesterdaySameTime),
    top3: [...today].sort((a, b) => b[1].qty - a[1].qty).slice(0, 3).map(([id]) => id),
  };
}

// Age in days of the oldest unpaid baki (FIFO: each joma pays off the oldest baki first).
export function oldestDueDays(ledger: { change: number; occurred_at: string }[], now: Date): number | null {
  const lots: { left: number; t: number }[] = [];
  for (const e of [...ledger].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))) {
    if (e.change > 0) { lots.push({ left: e.change, t: Date.parse(e.occurred_at) }); continue; }
    let pay = -e.change;
    while (pay > 0 && lots.length) {
      const take = Math.min(pay, lots[0].left);
      lots[0].left -= take;
      pay -= take;
      if (lots[0].left <= 0.001) lots.shift();
    }
  }
  return lots.length ? Math.floor((now.getTime() - lots[0].t) / DAY_MS) : null;
}

// Baki split by age of the oldest unpaid part: ≤7 days, 8–30, over 30 (null age counts as new).
export function dueAges(dues: { due: number; days: number | null }[]) {
  const b = [{ upto_days: 7, customers: 0, total: 0 }, { upto_days: 30, customers: 0, total: 0 }, { upto_days: null as number | null, customers: 0, total: 0 }];
  for (const d of dues) {
    const x = b[(d.days ?? 0) <= 7 ? 0 : (d.days ?? 0) <= 30 ? 1 : 2];
    x.customers++; x.total = r2(x.total + d.due);
  }
  return b;
}

export const URGENT_DAYS = 2;  // জরুরি: runs out within 2 days
export const OLD_DUE_DAYS = 7; // খেয়াল: baki older than a week
export type Action =
  | { kind: "urgent"; product_id: string; daysLeft: number }
  | { kind: "watch"; customer: string; due: number; days: number }
  | { kind: "tip"; product_ids: string[] };

// এখন যা করবেন: rules, not AI. At most 2 urgent + 1 watch + 1 tip.
export function pickActions(
  stock: { id: string; daysLeft: number | null }[],
  dues: { customer: string; due: number; days: number | null }[],
  lines: SaleLine[],
  now: Date,
): Action[] {
  const urgent: Action[] = stock.filter((p) => p.daysLeft !== null && p.daysLeft <= URGENT_DAYS)
    .sort((a, b) => a.daysLeft! - b.daysLeft!).slice(0, 2)
    .map((p) => ({ kind: "urgent", product_id: p.id, daysLeft: p.daysLeft! }));
  const old = dues.filter((d) => d.due > 0 && d.days !== null && d.days > OLD_DUE_DAYS).sort((a, b) => b.due - a.due)[0];
  const start = dhakaWeekStart(now).getTime(), end = now.getTime() + 1;
  const thisWeek = byProduct(lines, start, end), lastWeek = byProduct(lines, start - 7 * DAY_MS, end - 7 * DAY_MS);
  const growers = [...thisWeek].map(([id, p]) => [id, p.qty - (lastWeek.get(id)?.qty ?? 0)] as const)
    .filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
  return [
    ...urgent,
    ...(old ? [{ kind: "watch" as const, customer: old.customer, due: old.due, days: old.days! }] : []),
    ...(growers.length ? [{ kind: "tip" as const, product_ids: growers }] : []),
  ];
}

// পণ্যের বিক্রি: qty sold this Dhaka week per product. Best = sold most (qty > 0); worst = sold least,
// including products that sold nothing this week (they are the ones sitting on the shelf).
export function weekSellers(lines: SaleLine[], productIds: string[], now: Date, n = 10) {
  const sold = byProduct(lines, dhakaWeekStart(now).getTime(), now.getTime() + 1);
  const all = productIds.map((id) => ({ id, qty: r2(sold.get(id)?.qty ?? 0) }));
  const max = Math.max(0, ...all.map((p) => p.qty));
  const withPct = (p: { id: string; qty: number }) => ({ ...p, pct: max > 0 ? Math.round((p.qty / max) * 100) : 0 });
  return {
    best: all.filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, n).map(withPct),
    worst: [...all].sort((a, b) => a.qty - b.qty).slice(0, n).map(withPct),
  };
}
