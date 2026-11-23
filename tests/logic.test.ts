// Unit tests for the deterministic logic (no AI, no DB). Run: npm run test:logic
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeInput, normalizePersonName } from "../src/lib/logic/normalize.ts";
import { deriveAmounts } from "../src/lib/logic/amounts.ts";
import { matchCustomer, matchProduct } from "../src/lib/logic/matchProduct.ts";
import type { Extraction } from "../src/lib/schema.ts";

const base: Extraction = {
  type: "sale", items: [], customer: null, supplier: null, total_said: null, paid_said: null, due_said: null,
  method: null, expense_category: null, clarify_question: null, confidence: 1,
};
const item = (product: string, quantity: number | null, extra: Partial<Extraction["items"][number]> = {}) =>
  ({ product, quantity, unit: null, unit_price_said: null, line_total_said: null, ...extra });

test("normalizeInput: Bangla digits, spaces, length cap", () => {
  assert.equal(normalizeInput("  ২টা   তেল ৬৮০ টাকা "), "2টা তেল 680 টাকা");
  assert.equal(normalizeInput("x".repeat(600)).length, 500);
});

test("normalizePersonName strips honorifics", () => {
  assert.equal(normalizePersonName("রহিম ভাই"), "রহিম");
  assert.equal(normalizePersonName("Rahim  Vai"), "rahim");
  assert.equal(normalizePersonName("Salma apa"), "salma");
});

test("demo sentence: 2 oil, 680 said, 100 baki → price 340, paid 580", () => {
  const a = deriveAmounts({ ...base, customer: "রহিম ভাই", items: [item("সয়াবিন তেল", 2)], total_said: 680, due_said: 100 });
  assert.equal(a.items[0].unit_price, 340);
  assert.deepEqual([a.total, a.paid, a.due], [680, 580, 100]);
  assert.deepEqual(a.missing, []);
});

test("price not said → missing price, no guessing", () => {
  const a = deriveAmounts({ ...base, customer: "করিম", items: [item("সাবান", 3)] });
  assert.equal(a.items[0].unit_price, null);
  assert.equal(a.total, null);
  assert.deepEqual(a.missing, ["price"]);
});

test("nothing said about payment → cash sale, paid in full", () => {
  const a = deriveAmounts({ ...base, items: [item("চাল", 2, { unit_price_said: 75 })] });
  assert.deepEqual([a.total, a.paid, a.due], [150, 150, 0]);
});

test("paid said → due = total − paid; due without customer → missing customer", () => {
  const a = deriveAmounts({ ...base, items: [item("চিনি", 1, { line_total_said: 130 })], paid_said: 100 });
  assert.deepEqual([a.total, a.paid, a.due], [130, 100, 30]);
  assert.deepEqual(a.missing, ["customer"]);
});

test("multi-item: totals add up; said total that disagrees → warning", () => {
  const a = deriveAmounts({
    ...base, items: [item("সাবান", 2, { unit_price_said: 65 }), item("চিনি", 1, { unit_price_said: 130 })], total_said: 300,
  });
  assert.equal(a.total, 260);
  assert.deepEqual(a.warnings, ["TOTAL_MISMATCH"]);
});

test("multi-item without prices does not split the total", () => {
  const a = deriveAmounts({ ...base, items: [item("সাবান", 2), item("চিনি", 1)], total_said: 260 });
  assert.equal(a.items[0].unit_price, null);
  assert.deepEqual(a.missing, ["price"]);
});

test("payment and expense", () => {
  const p = deriveAmounts({ ...base, type: "payment", customer: "রহিম ভাই", paid_said: 300 });
  assert.deepEqual([p.total, p.paid, p.due, p.missing.length], [300, 300, 0, 0]);
  const p2 = deriveAmounts({ ...base, type: "payment", total_said: 300 });
  assert.deepEqual(p2.missing, ["customer"]);
  const e = deriveAmounts({ ...base, type: "expense", total_said: 800, expense_category: "বিদ্যুৎ বিল" });
  assert.deepEqual([e.total, e.paid, e.due], [800, 800, 0]);
});

test("paid more than total → due 0 + warning", () => {
  const a = deriveAmounts({ ...base, items: [item("চাল", 1, { unit_price_said: 76 })], paid_said: 100 });
  assert.equal(a.due, 0);
  assert.deepEqual(a.warnings, ["PAID_EXCEEDS_TOTAL"]);
});

const products = [
  { id: "oil", names: ["সয়াবিন তেল", "Soybean oil 2L", "soyabin tel", "soybean tel"] },
  { id: "sugar", names: ["চিনি", "Sugar", "chini"] },
  { id: "soap", names: ["গায়ে মাখা সাবান", "Bath soap", "sabun"] },
];

test("matchProduct: exact name, alias, small typo, new product", () => {
  assert.equal(matchProduct("সয়াবিন তেল", products), "oil");
  assert.equal(matchProduct("Soyabin Tel", products), "oil");
  assert.equal(matchProduct("soyabin tell", products), "oil"); // 1 typo
  assert.equal(matchProduct("cini", products), "sugar");       // short word, 1 typo
  assert.equal(matchProduct("ডিম", products), null);          // not in the list → new
});

test("matchCustomer: honorifics ignored", () => {
  const customers = [{ id: "rahim", names: ["রহিম ভাই"] }, { id: "karim", names: ["করিম"] }];
  assert.equal(matchCustomer("রহিম", customers), "rahim");
  assert.equal(matchCustomer("করিম ভাই", customers), "karim");
  assert.equal(matchCustomer("জসিম", customers), null);
});

import { answerPaid, cardChange, cardProblems, cardTotals, type Card } from "../src/lib/logic/card.ts";

const card = (over: Partial<Card>): Card => ({
  type: "sale", method: "cash", customer_id: null, customer_name: "", due_before: null, supplier_id: null, supplier_name: "", supplier_due_before: null, items: [], due: 0, all_due: false, received: null, paid_unknown: false, amount: null, expense_category: "", ...over,
});
const line = (quantity: number | null, unit_price: number | null) =>
  ({ product_id: "x", name: "তেল", unit: "pcs", quantity, unit_price, stock_before: 10 });

test("payment not said: named customer/supplier → ask, never assume cash; walk-in stays cash", () => {
  const akbar = deriveAmounts({ ...base, customer: "আকবর", items: [item("মসুর ডাল", 2, { unit_price_said: 135 })] });
  assert.deepEqual([akbar.ask_paid, akbar.paid, akbar.due], [true, null, 0]);
  const sup = deriveAmounts({ ...base, type: "purchase", supplier: "রহমান ট্রেডার্স", items: [item("চিনি", 20)], total_said: 2600 });
  assert.deepEqual([sup.ask_paid, sup.paid], [true, null]);
  const walkIn = deriveAmounts({ ...base, items: [item("চাল", 2, { unit_price_said: 75 })] });
  assert.deepEqual([walkIn.ask_paid, walkIn.paid], [false, 150]);
  const said = deriveAmounts({ ...base, customer: "আকবর", items: [item("চাল", 2, { unit_price_said: 75 })], due_said: 50 });
  assert.equal(said.ask_paid, false);
});

test("card: paid question blocks save until answered; answers set baki", () => {
  const c = card({ customer_name: "আকবর", items: [line(2, 135)], paid_unknown: true });
  assert.deepEqual(cardProblems(c), ["NEED_PAID"]);
  const full = { ...c, ...answerPaid(c, "full") };
  assert.deepEqual([cardTotals(full), cardProblems(full)], [{ total: 270, paid: 270, due: 0 }, []]);
  const none = { ...c, ...answerPaid(c, "none") };
  assert.deepEqual(cardTotals(none), { total: 270, paid: 0, due: 270 });
  const some = { ...c, ...answerPaid(c, 200) };
  assert.deepEqual([cardTotals(some), cardProblems(some)], [{ total: 270, paid: 200, due: 70 }, []]);
  const over = { ...c, ...answerPaid(c, 500) }; // gave a 500 note → no baki, ফেরত 230
  assert.deepEqual([cardTotals(over).due, cardChange(over)], [0, 230]);
  const purchase = card({ type: "purchase", supplier_name: "রহমান", items: [line(10, 100)], paid_unknown: true });
  assert.deepEqual(cardTotals({ ...purchase, ...answerPaid(purchase, 400) }), { total: 1000, paid: 400, due: 600 });
});

test("card: demo sale totals and no problems", () => {
  const c = card({ customer_name: "রহিম ভাই", items: [line(2, 340)], due: 100 });
  assert.deepEqual(cardTotals(c), { total: 680, paid: 580, due: 100 });
  assert.deepEqual(cardProblems(c), []);
});

test("card: missing price, due without customer, due above total are blocked", () => {
  assert.deepEqual(cardProblems(card({ items: [line(2, null)] })), ["NEED_ITEM_DETAILS"]);
  assert.deepEqual(cardProblems(card({ items: [line(1, 100)], due: 50 })), ["CUSTOMER_REQUIRED_FOR_DUE"]);
  assert.deepEqual(cardProblems(card({ customer_name: "করিম", items: [line(1, 100)], due: 150 })), ["DUE_EXCEEDS_TOTAL"]);
});

test("card: all_due (পুরোটাই বাকি) follows the total once the price is filled in", () => {
  const c = card({ customer_name: "মিজান", items: [line(1, 50)], all_due: true });
  assert.deepEqual(cardTotals(c), { total: 50, paid: 0, due: 50 });
  assert.deepEqual(cardProblems(c), []);
  assert.deepEqual(cardProblems(card({ items: [line(1, 50)], all_due: true })), ["CUSTOMER_REQUIRED_FOR_DUE"]);
  // AI side: "puro baki" with no price → paid 0 is kept, no guessed due
  const a = deriveAmounts({ ...base, customer: "মিজান", items: [item("চিনি", 1)], paid_said: 0 });
  assert.deepEqual([a.paid, a.due, a.missing], [0, 0, ["price"]]);
});

test("card: ফেরত = cash handed over − paid; none when not said or not more", () => {
  assert.equal(cardChange(card({ items: [line(1, 380)], received: 500 })), 120);
  assert.equal(cardChange(card({ customer_name: "সালমা", items: [line(2, 38)], due: 26, received: 50 })), null); // 50 paid, 26 baki
  assert.equal(cardChange(card({ items: [line(1, 380)] })), null);              // nothing said
  assert.equal(cardChange(card({ items: [line(1, null)], received: 500 })), null); // price not known yet
});

test("card: expense ignores due; payment needs customer and ≤ due; unknown needs a type", () => {
  assert.deepEqual(cardTotals(card({ type: "expense", amount: 500, due: 99 })), { total: 500, paid: 500, due: 0 });
  assert.deepEqual(cardProblems(card({ type: "payment", amount: 300 })), ["CUSTOMER_REQUIRED"]);
  assert.deepEqual(cardProblems(card({ type: "payment", amount: 300, customer_name: "রহিম ভাই", due_before: 40 })), ["PAYMENT_EXCEEDS_DUE"]);
  assert.deepEqual(cardProblems(card({ type: "unknown" })), ["NEED_TYPE"]);
  assert.deepEqual(cardProblems(card({ type: "expense", amount: null })), ["AMOUNT_REQUIRED"]);
});

import { dhakaWeekStart, weeklyProfit } from "../src/lib/logic/summary.ts";

test("dhakaWeekStart: Saturday 00:00 Dhaka, even late at night UTC", () => {
  // Mon 23 Nov 2026 01:00 Dhaka = Sun 22 Nov 19:00 UTC → week starts Sat 21 Nov 00:00 Dhaka = 20 Nov 18:00 UTC
  assert.equal(dhakaWeekStart(new Date("2026-11-22T19:00:00Z")).toISOString(), "2026-11-20T18:00:00.000Z");
  // Fri 27 Nov 23:30 Dhaka is still the same week
  assert.equal(dhakaWeekStart(new Date("2026-11-27T17:30:00Z")).toISOString(), "2026-11-20T18:00:00.000Z");
  // Sat 28 Nov 00:30 Dhaka starts the next week
  assert.equal(dhakaWeekStart(new Date("2026-11-27T18:30:00Z")).toISOString(), "2026-11-27T18:00:00.000Z");
});

test("weeklyProfit: this week vs last week, daily bars", () => {
  const now = new Date("2026-11-23T06:00:00Z"); // Mon 23 Nov, 12:00 Dhaka
  const lines = [
    { occurred_at: "2026-11-22T04:00:00Z", quantity: 2, unit_price: 340, cost_price: 310 }, // Sun this week: +60
    { occurred_at: "2026-11-23T03:00:00Z", quantity: 1, unit_price: 130, cost_price: 118 }, // Mon this week: +12
    { occurred_at: "2026-11-15T04:00:00Z", quantity: 4, unit_price: 76, cost_price: 68 },   // last week, before same point: +32
    { occurred_at: "2026-11-18T04:00:00Z", quantity: 4, unit_price: 76, cost_price: 68 },   // last week Wed, after same point: ignored
    { occurred_at: "2026-11-01T04:00:00Z", quantity: 9, unit_price: 100, cost_price: 1 },   // older: ignored
  ];
  const w = weeklyProfit(lines, now);
  assert.deepEqual([w.profit, w.lastWeek, w.changePct, w.sales], [72, 32, 125, 810]);
  assert.deepEqual(w.daily, [0, 60, 12, 0, 0, 0, 0]);
  assert.equal(w.todayIndex, 2);
  assert.equal(weeklyProfit([], now).changePct, null);
});

import { dailySeries, forecast, stockOutlook } from "../src/lib/logic/forecast.ts";

test("dailySeries fills missing days with 0", () => {
  assert.deepEqual(dailySeries([{ day: "2026-11-01", qty: 2 }, { day: "2026-11-03", qty: 5 }], "2026-11-01", "2026-11-04"), [2, 0, 5, 0]);
});

test("forecast: cold start under 14 days → null", () => {
  assert.equal(forecast(new Array(13).fill(3), "2026-11-01"), null);
});

test("forecast: flat demand stays flat; weekday pattern is kept", () => {
  const flat = forecast(new Array(28).fill(4), "2026-10-01");
  assert.deepEqual([flat!.avg, ...new Set(flat!.daily)], [4, 4]);
  // Fridays sell double: 2026-10-02 is a Friday, 28 days of history
  const sales = Array.from({ length: 28 }, (_, t) => (t % 7 === 1 ? 8 : 4));
  const f = forecast(sales, "2026-10-01")!;
  // next day after the series (2026-10-29, Thu) ... index 1 = Fri 30 Oct is the peak
  assert.equal(Math.max(...f.daily), f.daily[1]);
  assert.ok(f.daily[1] > 1.5 * f.daily[0]);
});

test("forecast: recent rise pulls the level up (SES)", () => {
  const f = forecast([...new Array(21).fill(2), ...new Array(7).fill(6)], "2026-10-01")!;
  assert.ok(f.avg > 4 && f.avg < 6);
});

test("stockOutlook: days left and status", () => {
  assert.deepEqual(stockOutlook(8, 15, 4), { daysLeft: 2, status: "low" });
  assert.deepEqual(stockOutlook(100, 10, 5), { daysLeft: 20, status: "ok" });
  assert.deepEqual(stockOutlook(30, 10, 5), { daysLeft: 6, status: "low" }); // under 7 days
  assert.deepEqual(stockOutlook(0, 10, 5), { daysLeft: 0, status: "out" });
  assert.deepEqual(stockOutlook(20, 5, null), { daysLeft: null, status: "ok" }); // learning, above reorder
  assert.deepEqual(stockOutlook(4, 5, 0), { daysLeft: null, status: "low" });    // no sales, below reorder
});

import { dhakaMonthStart, monthSummary, oldestDueDays, pickActions, todayNumbers } from "../src/lib/logic/summary.ts";

test("dhakaMonthStart: 1st 00:00 Dhaka", () => {
  assert.equal(dhakaMonthStart(new Date("2026-11-23T06:00:00Z")).toISOString(), "2026-10-31T18:00:00.000Z");
  assert.equal(dhakaMonthStart(new Date("2026-11-23T06:00:00Z"), -1).toISOString(), "2026-09-30T18:00:00.000Z");
});

const L = (d: string, q: number, p: number, c: number, id: string) => ({ occurred_at: d, quantity: q, unit_price: p, cost_price: c, product_id: id });

test("monthSummary: same point last month, top products", () => {
  const m = monthSummary([
    L("2026-11-02T04:00:00Z", 2, 340, 310, "oil"), L("2026-11-05T04:00:00Z", 10, 76, 68, "rice"),
    L("2026-10-03T04:00:00Z", 5, 76, 68, "rice"),  // last month, before the same point
    L("2026-10-20T04:00:00Z", 99, 76, 68, "rice"), // last month, after the same point: ignored
  ], [{ occurred_at: "2026-11-03T04:00:00Z", total: 1200 }], new Date("2026-11-10T06:00:00Z"));
  assert.deepEqual([m.sales, m.profit, m.spend, m.lastMonthSales, m.salesChangePct, m.marginPct], [1440, 140, 1200, 380, 279, 9.7]);
  assert.deepEqual(m.top5.map((p) => p.id), ["rice", "oil"]);
});

test("todayNumbers: today vs yesterday up to the same time", () => {
  const t = todayNumbers([
    L("2026-11-23T03:00:00Z", 3, 10, 8, "a"), L("2026-11-23T04:00:00Z", 5, 10, 8, "b"),
    L("2026-11-22T03:00:00Z", 4, 10, 8, "a"), L("2026-11-22T10:00:00Z", 9, 10, 8, "a"), // yesterday after 12:00: ignored
  ], new Date("2026-11-23T06:00:00Z"));
  assert.deepEqual([t.sales, t.yesterdaySameTime, t.changePct, t.top3], [80, 40, 100, ["b", "a"]]);
});

test("oldestDueDays: FIFO, payments clear the oldest baki first", () => {
  const now = new Date("2026-11-23T00:00:00Z");
  assert.equal(oldestDueDays([
    { change: 100, occurred_at: "2026-11-01T00:00:00Z" },
    { change: 50, occurred_at: "2026-11-10T00:00:00Z" },
    { change: -100, occurred_at: "2026-11-12T00:00:00Z" },
  ], now), 13);
  assert.equal(oldestDueDays([{ change: 100, occurred_at: "2026-11-01T00:00:00Z" }, { change: -100, occurred_at: "2026-11-02T00:00:00Z" }], now), null);
});

test("pickActions: urgent ≤ 2 days, oldest big due, growing products", () => {
  const a = pickActions(
    [{ id: "sugar", daysLeft: 1.7 }, { id: "oil", daysLeft: 1.9 }, { id: "milk", daysLeft: 5 }, { id: "x", daysLeft: 0 }],
    [{ customer: "রহিম", due: 1200, days: 14 }, { customer: "করিম", due: 3000, days: 3 }],
    [L("2026-11-22T04:00:00Z", 5, 1, 1, "dal")], new Date("2026-11-23T06:00:00Z"),
  );
  assert.deepEqual(a, [
    { kind: "urgent", product_id: "x", daysLeft: 0 }, { kind: "urgent", product_id: "sugar", daysLeft: 1.7 },
    { kind: "watch", customer: "রহিম", due: 1200, days: 14 }, { kind: "tip", product_ids: ["dal"] },
  ]);
});

import { allowedNumbers, numbersIn, numbersOk } from "../src/lib/logic/numberCheck.ts";

test("numberCheck: Bangla digits, commas, decimals; unknown number fails", () => {
  assert.deepEqual(numbersIn("মোট বিক্রি ৳ ১,৬৮,৪০০, মার্জিন ১৮.৫%"), [168400, 18.5]);
  const ok = allowedNumbers({ sales: 168400, margin: 18.5, top: ["a", "b", "c"], change: -12 });
  assert.equal(numbersOk("বিক্রি ৳১,৬৮,৪০০, ১২% কম; সেরা ৩টি পণ্য", ok), true);
  assert.equal(numbersOk("বিক্রি প্রায় ১.৭ লাখ", ok), false); // a number the facts don't have
});

import { restock } from "../src/lib/logic/restock.ts";

const rp = (id: string, stock: number, avg: number | null, cost: number, sell: number) =>
  ({ id, stock, avg, daysLeft: avg ? stock / avg : null, cost_price: cost, sell_price: sell });

test("restock: urgent first, need = 9 days of demand − stock, budget respected", () => {
  const items = [rp("rice", 250, 13, 60, 70), rp("oil", 8, 4, 310, 340), rp("sugar", 12, 7, 118, 130)];
  const r = restock(items, 5000);
  // sugar (1.7 days) need ceil(63 − 12) = 51, oil (2 days) need ceil(36 − 8) = 28; rice lasts 19 days → not a candidate
  // pass 1 (3 days each): sugar 9 (৳1,062), oil 4 (৳1,240) → left ৳2,698; pass 2: sugar +22 → left ৳102
  assert.deepEqual(r.lines.map((l) => [l.id, l.qty, l.need, l.cost]), [["sugar", 31, 51, 3658], ["oil", 4, 28, 1240]]);
  assert.equal(r.left, 102);
  assert.deepEqual(r.skipped, []);
});

test("restock: tie on days left → bigger margin first; zero budget → nothing", () => {
  const r = restock([rp("a", 4, 2, 10, 11), rp("b", 4, 2, 10, 20)], 1000);
  assert.deepEqual(r.lines.map((l) => [l.id, l.qty, l.cost]), [["b", 14, 140], ["a", 14, 140]]);
  assert.equal(r.spent, 280);
  assert.deepEqual(restock([rp("a", 4, 2, 10, 11)], 0).lines, []);
});

import { countDifference, moneyPosition } from "../src/lib/logic/money.ts";

test("moneyPosition: total = cash + bank + bkash + receivable − payable", () => {
  const row = (account: "cash" | "bank" | "bkash", balance: number) => ({ account, counted: null, counted_at: null, money_in: 0, money_out: 0, balance });
  const m = moneyPosition([row("cash", 12500), row("bank", 38000), row("bkash", 7900)], 14250, 6000);
  assert.equal(m.bankTotal, 45900);
  assert.equal(m.total, 66650); // the mockup's numbers
  assert.equal(m.cash.balance, 12500);
});

test("moneyPosition: missing accounts count as 0; negative balance kept; no float drift", () => {
  const m = moneyPosition([{ account: "cash", counted: 500, counted_at: "2026-11-23T03:10:00Z", money_in: 0.1, money_out: 100, balance: -0.3 }], 0.2, 0);
  assert.equal(m.bank.balance, 0);
  assert.equal(m.bkash.counted, null);
  assert.equal(m.total, -0.1);
});

test("countDifference: counted − expected", () => {
  assert.equal(countDifference(500, 580), -80);
  assert.equal(countDifference(46400, 45900), 500);
  assert.equal(countDifference(0.3, 0.1), 0.2);
});

test("দেনা: purchase on credit needs a supplier; supplier payment is one amount", () => {
  const credit = deriveAmounts({ ...base, type: "purchase", supplier: "রহমান ট্রেডার্স", items: [item("চিনি", 20)], total_said: 2600, paid_said: 1000 });
  assert.equal(credit.items[0].unit_price, 130);
  assert.equal(credit.paid, 1000);
  assert.equal(credit.due, 1600);
  assert.deepEqual(credit.missing, []);
  const noSupplier = deriveAmounts({ ...base, type: "purchase", items: [item("চিনি", 20)], total_said: 2600, due_said: 1600 });
  assert.deepEqual(noSupplier.missing, ["supplier"]); // never asks for a customer on a purchase
  const pay = deriveAmounts({ ...base, type: "supplier_payment", supplier: "রহমান ট্রেডার্স", paid_said: 1500, method: "bkash" });
  assert.deepEqual([pay.total, pay.paid, pay.due, pay.missing], [1500, 1500, 0, []]);
  assert.deepEqual(deriveAmounts({ ...base, type: "supplier_payment", paid_said: 1500 }).missing, ["supplier"]);
});

test("card: credit purchase and supplier payment checks", () => {
  const buy = card({ type: "purchase", items: [line(10, 30)], due: 200 });
  assert.deepEqual(cardTotals(buy), { total: 300, paid: 100, due: 200 });
  assert.deepEqual(cardProblems(buy), ["SUPPLIER_REQUIRED_FOR_DUE"]);
  assert.deepEqual(cardProblems({ ...buy, supplier_name: "করিম ট্রেডার্স" }), []);
  assert.deepEqual(cardProblems({ ...buy, supplier_name: "করিম ট্রেডার্স", due: 400 }), ["DUE_EXCEEDS_TOTAL"]);
  const pay = card({ type: "supplier_payment", amount: 250, supplier_name: "করিম ট্রেডার্স", supplier_id: "s1", supplier_due_before: 200 });
  assert.deepEqual(cardTotals(pay), { total: 250, paid: 250, due: 0 });
  assert.deepEqual(cardProblems(pay), ["SUPPLIER_PAYMENT_EXCEEDS_DUE"]);
  assert.deepEqual(cardProblems({ ...pay, amount: 200 }), []);
  assert.deepEqual(cardProblems({ ...pay, supplier_name: "" }), ["SUPPLIER_REQUIRED"]);
});

// ── ব্যবসার অবস্থা: formulas and accounting rules (src/lib/logic/business.ts) ──
import { businessPosition, dailySales, expenseBreakdown, periodRange, profitAndLoss, topProducts } from "../src/lib/logic/business.ts";

const NOW = new Date("2026-11-23T10:00:00+06:00");
const sold = (at: string, qty: number, price: number, cost: number, product_id = "p1") =>
  ({ occurred_at: at, quantity: qty, unit_price: price, cost_price: cost, product_id });

test("periodRange: 7d / 30d / month in Dhaka days, previous period ends at the same point", () => {
  const w = periodRange("7d", NOW);
  assert.equal(w.days.length, 7);
  assert.deepEqual([w.days[0], w.days[6]], ["2026-11-17", "2026-11-23"]);
  assert.equal(new Date(w.start).toISOString(), "2026-11-16T18:00:00.000Z"); // 17 Nov 00:00 Dhaka
  assert.equal(w.end - w.start, w.prevEnd - w.prevStart);
  assert.equal(periodRange("30d", NOW).days.length, 30);
  const m = periodRange("month", NOW);
  assert.deepEqual([m.days[0], m.days.length], ["2026-11-01", 23]);
  assert.equal(new Date(m.prevStart).toISOString(), "2026-09-30T18:00:00.000Z"); // 1 Oct 00:00 Dhaka
  assert.ok(m.prevEnd <= m.start);
});

test("profitAndLoss: gross = revenue − COGS, net = gross − expenses, margin = net ÷ revenue", () => {
  const { start, end } = periodRange("month", NOW);
  const lines = [sold("2026-11-10T12:00:00+06:00", 10, 100, 70), sold("2026-10-31T12:00:00+06:00", 5, 100, 70)]; // 2nd is last month
  const txns = [
    { type: "expense", occurred_at: "2026-11-05T12:00:00+06:00", total: 100, expense_category: "বিদ্যুৎ বিল" },
    { type: "purchase", occurred_at: "2026-11-06T12:00:00+06:00", total: 5000 },  // stock, not an expense
    { type: "payment", occurred_at: "2026-11-07T12:00:00+06:00", total: 400 },    // due collection / supplier payment, not sale or expense
  ];
  assert.deepEqual(profitAndLoss(lines, txns, start, end),
    { revenue: 1000, cogs: 700, gross: 300, expenses: 100, net: 200, marginPct: 20 });
  assert.equal(profitAndLoss([], [], start, end).marginPct, null); // no sales → no margin
});

test("credit sale counts as revenue in full; the later collection adds nothing", () => {
  const { start, end } = periodRange("month", NOW);
  const sale = [sold("2026-11-10T12:00:00+06:00", 1, 500, 400)]; // sold for 500, 300 of it on baki
  const collected = [{ type: "payment", occurred_at: "2026-11-12T12:00:00+06:00", total: 300 }];
  assert.equal(profitAndLoss(sale, collected, start, end).revenue, 500);
});

test("businessPosition: net worth = money + receivable + stock at cost − payable; purchases don't change it", () => {
  const base = { cash: 1000, bank: 500, bkash: 200, receivable: 300, payable: 0, stock: [{ qty: 10, cost: 50 }, { qty: -2, cost: 99 }] };
  const p = businessPosition(base);
  assert.deepEqual(p, { available: 1700, receivable: 300, payable: 0, inventory: 500, netWorth: 2500 });
  // buy 1000 of stock on credit: stock +1000, দেনা +1000 → same net worth (no double counting)
  const credit = businessPosition({ ...base, payable: 1000, stock: [...base.stock, { qty: 20, cost: 50 }] });
  assert.equal(credit.netWorth, p.netWorth);
  // buy it for cash instead: cash −1000, stock +1000 → same net worth
  assert.equal(businessPosition({ ...base, cash: 0, stock: [...base.stock, { qty: 20, cost: 50 }] }).netWorth, p.netWorth);
  // sell 1 unit (cost 50) for 80 on baki: stock −50, receivable +80 → net worth rises by the gross profit 30
  assert.equal(businessPosition({ ...base, receivable: 380, stock: [{ qty: 9, cost: 50 }, base.stock[1]] }).netWorth, p.netWorth + 30);
});

test("charts: daily sales per Dhaka day, expenses by category, top products", () => {
  const { start, end, days } = periodRange("7d", NOW);
  const lines = [
    sold("2026-11-22T23:30:00+06:00", 2, 100, 80, "a"), // late night is still 22 Nov in Dhaka
    sold("2026-11-23T09:00:00+06:00", 1, 300, 200, "b"),
  ];
  const d = dailySales(lines, days);
  assert.equal(d.length, 7);
  assert.deepEqual(d.slice(-2), [{ day: "2026-11-22", sales: 200 }, { day: "2026-11-23", sales: 300 }]);
  const ex = expenseBreakdown([
    { type: "expense", occurred_at: "2026-11-20T10:00:00+06:00", total: 80, expense_category: "চা-নাস্তা" },
    { type: "expense", occurred_at: "2026-11-21T10:00:00+06:00", total: 200, expense_category: null },
    { type: "purchase", occurred_at: "2026-11-21T10:00:00+06:00", total: 9000 },
  ], start, end, "অন্যান্য");
  assert.deepEqual(ex, [{ category: "অন্যান্য", total: 200 }, { category: "চা-নাস্তা", total: 80 }]);
  assert.deepEqual(topProducts(lines, start, end).map((p) => p.id), ["b", "a"]);
});

test("weekSellers: best by qty this Dhaka week, worst includes products that sold nothing", async () => {
  const { weekSellers } = await import("../src/lib/logic/summary.ts");
  const now = new Date("2026-11-23T10:00:00+06:00"); // Monday; week started Sat 21 Nov
  const lines = [
    sold("2026-11-21T09:00:00+06:00", 4, 10, 8, "a"),
    sold("2026-11-22T09:00:00+06:00", 2, 10, 8, "b"),
    sold("2026-11-20T23:00:00+06:00", 50, 10, 8, "b"), // last week, ignored
  ];
  const w = weekSellers(lines, ["a", "b", "c"], now);
  assert.deepEqual(w.best, [{ id: "a", qty: 4, pct: 100 }, { id: "b", qty: 2, pct: 50 }]);
  assert.deepEqual(w.worst.map((p) => p.id), ["c", "b", "a"]);
  assert.deepEqual(weekSellers([], ["a"], now), { best: [], worst: [{ id: "a", qty: 0, pct: 0 }] });
});

test("transactions: today's totals and day groups (Dhaka), supplier payment isn't জমা", async () => {
  const { todayTotals, groupByDay, txnPeriodStart } = await import("../src/lib/logic/ledger.ts");
  const now = new Date("2026-11-23T10:00:00+06:00");
  const rows = [
    { type: "sale", occurred_at: "2026-11-23T09:00:00+06:00", total: 500 },
    { type: "purchase", occurred_at: "2026-11-23T08:30:00+06:00", total: 1200 },
    { type: "expense", occurred_at: "2026-11-23T08:40:00+06:00", total: 80 },
    { type: "payment", occurred_at: "2026-11-23T09:30:00+06:00", total: 300 },
    { type: "payment", occurred_at: "2026-11-23T09:40:00+06:00", total: 1000, supplier_id: "s1" },
    { type: "sale", occurred_at: "2026-11-22T23:59:00+06:00", total: 999 }, // yesterday in Dhaka
  ];
  assert.deepEqual(todayTotals(rows, now), { sales: 500, count: 5, spend: 1280, collected: 300 });
  const g = groupByDay(rows, "sale");
  assert.deepEqual(g.map((d) => [d.day, d.items.length]), [["2026-11-23", 1], ["2026-11-22", 1]]);
  assert.equal(groupByDay(rows, "all")[0].items[0].total, 1000); // newest first
  assert.equal(txnPeriodStart("today", now).toISOString(), "2026-11-22T18:00:00.000Z");
});

test("products: margin on sell price, sort orders", async () => {
  const { marginPct, sortProducts } = await import("../src/lib/logic/products.ts");
  assert.equal(marginPct(180, 160), 11);
  assert.equal(marginPct(0, 10), null);
  const rows = [
    { name: "চিনি", weekQty: 5, sell_price: 140, cost_price: 125 },
    { name: "আলু", weekQty: 9, sell_price: 40, cost_price: 30 },
    { name: "ডিম", weekQty: 0, sell_price: 55, cost_price: 48 },
  ];
  assert.deepEqual(sortProducts(rows, "best", "bn").map((p) => p.name), ["আলু", "চিনি", "ডিম"]);
  assert.deepEqual(sortProducts(rows, "worst", "bn").map((p) => p.name), ["ডিম", "চিনি", "আলু"]);
  assert.deepEqual(sortProducts(rows, "margin", "bn").map((p) => p.name), ["আলু", "ডিম", "চিনি"]); // 25%, 13%, 11%
});
