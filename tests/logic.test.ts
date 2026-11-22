// Unit tests for the deterministic logic (no AI, no DB). Run: npm run test:logic
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeInput, normalizePersonName } from "../src/lib/logic/normalize.ts";
import { deriveAmounts } from "../src/lib/logic/amounts.ts";
import { matchCustomer, matchProduct } from "../src/lib/logic/matchProduct.ts";
import type { Extraction } from "../src/lib/schema.ts";

const base: Extraction = {
  type: "sale", items: [], customer: null, total_said: null, paid_said: null, due_said: null,
  expense_category: null, clarify_question: null, confidence: 1,
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

import { cardProblems, cardTotals, type Card } from "../src/lib/logic/card.ts";

const card = (over: Partial<Card>): Card => ({
  type: "sale", customer_id: null, customer_name: "", due_before: null, items: [], due: 0, amount: null, expense_category: "", ...over,
});
const line = (quantity: number | null, unit_price: number | null) =>
  ({ product_id: "x", name: "তেল", unit: "pcs", quantity, unit_price, stock_before: 10 });

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

test("card: purchase ignores due; payment needs customer and ≤ due; unknown needs a type", () => {
  assert.deepEqual(cardTotals(card({ type: "purchase", items: [line(10, 120)], due: 99 })), { total: 1200, paid: 1200, due: 0 });
  assert.deepEqual(cardProblems(card({ type: "payment", amount: 300 })), ["CUSTOMER_REQUIRED"]);
  assert.deepEqual(cardProblems(card({ type: "payment", amount: 300, customer_name: "রহিম ভাই", due_before: 40 })), ["PAYMENT_EXCEEDS_DUE"]);
  assert.deepEqual(cardProblems(card({ type: "unknown" })), ["NEED_TYPE"]);
  assert.deepEqual(cardProblems(card({ type: "expense", amount: null })), ["AMOUNT_REQUIRED"]);
});
