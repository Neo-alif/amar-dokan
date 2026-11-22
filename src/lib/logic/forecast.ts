// Demand forecast per product (TRD §6): simple exponential smoothing (SES) × weekday factor. Pure, no DB.
export const ALPHA = 0.3;        // weight of the newest day: recent days count more
export const MIN_DAYS = 14;      // less history → "শিখছি" (no forecast, reorder level only)
export const HORIZON_DAYS = 7;
export const LOW_DAYS = 7;       // "কম" when stock lasts under a week (mockup: ৭ দিনের কম চলবে)
const FACTOR_DAYS = 56;          // weekday pattern from the last 8 weeks
const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3600 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

// "YYYY-MM-DD" of the Asia/Dhaka calendar day that contains `d`.
export const dhakaDay = (d: Date) => new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(day).getUTCDay(); // 0 = Sunday

// One number per day from firstDay to lastDay (inclusive); days without sales are 0.
export function dailySeries(rows: { day: string; qty: number }[], firstDay: string, lastDay: string): number[] {
  const n = Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / DAY_MS) + 1;
  const out = new Array<number>(Math.max(0, n)).fill(0);
  for (const r of rows) {
    const i = Math.round((Date.parse(r.day) - Date.parse(firstDay)) / DAY_MS);
    if (i >= 0 && i < out.length) out[i] += r.qty;
  }
  return out;
}

// sales[t] = qty sold on firstDay + t (complete days, oldest first).
// Returns the next 7 days, starting the day after the series ends, or null while still learning.
export function forecast(sales: number[], firstDay: string): { daily: number[]; avg: number } | null {
  const n = sales.length;
  if (n < MIN_DAYS) return null;
  const dow = (t: number) => weekday(addDays(firstDay, t));

  // weekday factor = average on that weekday ÷ overall average (clamped so one odd day can't dominate)
  const from = Math.max(0, n - FACTOR_DAYS);
  const sum = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
  for (let t = from; t < n; t++) { sum[dow(t)] += sales[t]; cnt[dow(t)]++; }
  const overall = sum.reduce((a, b) => a + b, 0) / (n - from);
  const factor = sum.map((s, d) => (overall === 0 || cnt[d] === 0 ? 1 : Math.min(2, Math.max(0.5, s / cnt[d] / overall))));

  // SES on the weekday-free series: level = α·today + (1 − α)·yesterday's level
  const x = sales.map((s, t) => s / factor[dow(t)]);
  let level = x.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  for (let t = 7; t < n; t++) level = ALPHA * x[t] + (1 - ALPHA) * level;

  const daily = Array.from({ length: HORIZON_DAYS }, (_, i) => r2(level * factor[dow(n + i)]));
  return { daily, avg: r2(daily.reduce((a, b) => a + b, 0) / HORIZON_DAYS) };
}

export type StockStatus = "out" | "low" | "ok";

// days_left = stock ÷ forecast daily average. null = can't say (learning, or no sales expected).
export function stockOutlook(stock: number, reorderLevel: number, avg: number | null) {
  const daysLeft = stock <= 0 ? 0 : avg && avg > 0 ? r2(stock / avg) : null;
  const status: StockStatus =
    stock <= 0 ? "out" : stock <= reorderLevel || (daysLeft !== null && daysLeft < LOW_DAYS) ? "low" : "ok";
  return { daysLeft, status };
}
