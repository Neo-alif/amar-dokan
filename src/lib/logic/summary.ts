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

export type SaleLine = { occurred_at: string; quantity: number; unit_price: number; cost_price: number };

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
