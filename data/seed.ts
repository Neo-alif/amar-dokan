// Seed: a synthetic 60-day grocery shop (self-generated data, no real customers).
// Run: node --env-file=.env.local data/seed.ts
//
// Every transaction goes through the same DB function as the app (apply_transaction),
// so the demo data obeys the same money and stock rules. If DEMO_SHOP_ID is set, that
// shop and only its rows are deleted first (FK cascade), then recreated with the same id.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type Product = {
  name_bn: string; name_en: string; aliases: string[]; unit: string;
  cost_price: number; sell_price: number; reorder_level: number;
  seed_avg_daily_sales: number; seed_low_stock?: boolean;
};
type Item = { product_id: string; quantity: number; unit_price: number };

const DAYS = 60;
const LOW_STOCK_WINDOW = 1;    // low-stock products: small top-up deliveries, the last one yesterday
const LOW_STOCK_TARGET_DAYS = 2; // …sized to leave ~2 days of stock today (reorder level is ~3 days)
const WEEKDAY_FACTOR = [0.95, 0.9, 0.95, 1.0, 1.15, 1.25, 1.0]; // Sun..Sat; Thu/Fri busier
const CUSTOMERS = ["রহিম ভাই", "করিম", "জসিম", "সালমা আপা", "রফিক", "নাসির", "শাহানা", "বাবুল", "মিজান"];
const SUPPLIERS = ["রহমান ট্রেডার্স", "মেঘনা ডিস্ট্রিবিউটর", "তাজ ফুডস"];
// দেনা: from `day` on, the next morning restock leaves `due` unpaid (capped by its total); `pay` = paid back that day.
const SUPPLIER_PLAN: { day: number; supplier: number; due?: number; pay?: number }[] = [
  { day: -40, supplier: 0, due: 5000 },
  { day: -22, supplier: 1, due: 2500 },
  { day: -18, supplier: 0, pay: 3000 },
  { day: -8, supplier: 0, due: 2000 },
  { day: -4, supplier: 2, due: 1000 },
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

// Deterministic random numbers (mulberry32), so every run builds the same shop.
let seed = 20261121;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function poisson(lambda: number) {
  const limit = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > limit);
  return k - 1;
}
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const round10 = (n: number) => Math.round(n / 10) * 10;

// Dhaka calendar helpers (UTC+6, no DST).
const DHAKA_MS = 6 * 3600 * 1000;
const nowDhaka = new Date(Date.now() + DHAKA_MS);
function dhakaDay(offset: number) {
  const d = new Date(Date.UTC(nowDhaka.getUTCFullYear(), nowDhaka.getUTCMonth(), nowDhaka.getUTCDate() + offset));
  return { iso: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), dayOfMonth: d.getUTCDate() };
}
// Demand multiplier for a day: weekday pattern; today only gets the hours already passed (shop 9–21).
const TODAY_HOUR = Math.min(21, nowDhaka.getUTCHours());
function dayFactor(offset: number) {
  const f = WEEKDAY_FACTOR[dhakaDay(offset).weekday];
  if (offset < 0) return f;
  return TODAY_HOUR < 9 ? 0 : (f * (TODAY_HOUR - 9 + 1)) / 13;
}
const expectedDemand = (p: Product, from: number, to: number) => {
  let sum = 0;
  for (let o = from; o <= to; o++) sum += p.seed_avg_daily_sales * dayFactor(o);
  return sum;
};
const at = (day: string, hour: number, minute = Math.floor(rand() * 60)) =>
  `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+06:00`;

async function apply(payload: Record<string, unknown>) {
  const { error } = await db.rpc("apply_transaction", { p: { idempotency_key: randomUUID(), shop_id: shopId, ...payload } });
  if (error) throw new Error(`apply_transaction failed: ${error.message} ${JSON.stringify(payload)}`);
}

// ── 1. Reset the demo shop (only its rows) ──
const shopId = process.env.DEMO_SHOP_ID || randomUUID();
if (process.env.DEMO_SHOP_ID) {
  // Order matters: a single cascade from shops trips the transaction_items → products FK.
  // transactions cascade to items, stock_movements, customer_ledger and supplier_ledger; shops then cascade
  // to products, customers and suppliers. Every step is limited to this shop.
  // stock_movements is deleted directly too: stock-count adjustments (004) have no transaction to cascade from.
  for (const [table, column] of [["ai_logs", "shop_id"], ["transactions", "shop_id"], ["stock_movements", "shop_id"], ["shops", "id"]]) {
    const { error } = await db.from(table).delete().eq(column, shopId);
    if (error) throw new Error(`delete demo ${table} failed: ${error.message}`);
  }
  console.log("Deleted old demo shop rows");
}
{
  const { error } = await db.from("shops").insert({ id: shopId, name: "করিম জেনারেল স্টোর (নমুনা)", owner_name: "করিম" });
  if (error) throw new Error(`insert shop failed: ${error.message}`);
}

// ── 2. Products (stock 0; all stock arrives through purchases) and customers ──
const catalog: Product[] = JSON.parse(readFileSync(new URL("./products.json", import.meta.url), "utf8"));
const { data: prodRows, error: pErr } = await db.from("products").insert(
  catalog.map((p) => ({
    shop_id: shopId, name_bn: p.name_bn, name_en: p.name_en, aliases: p.aliases, unit: p.unit,
    cost_price: p.cost_price, sell_price: p.sell_price, reorder_level: p.reorder_level, stock_qty: 0,
  })),
).select("id, name_bn");
if (pErr || !prodRows) throw new Error(`insert products failed: ${pErr?.message}`);
const products = catalog.map((p) => ({ ...p, id: prodRows.find((r) => r.name_bn === p.name_bn)!.id, stock: 0 }));

const { data: custRows, error: cErr } = await db.from("customers")
  .insert(CUSTOMERS.map((name) => ({ shop_id: shopId, name }))).select("id, name");
if (cErr || !custRows) throw new Error(`insert customers failed: ${cErr?.message}`);
const customers = custRows.map((c) => ({ ...c, due: 0 }));

const { data: suppRows, error: sErr } = await db.from("suppliers")
  .insert(SUPPLIERS.map((name) => ({ shop_id: shopId, name }))).select("id, name");
if (sErr || !suppRows) throw new Error(`insert suppliers failed: ${sErr?.message}`);
const suppliers = SUPPLIERS.map((name) => ({ id: suppRows.find((r) => r.name === name)!.id, name, due: 0 }));
const supplierPlan = [...SUPPLIER_PLAN]; // consumed in order as the days pass

// Opening money (টাকার অবস্থা): the owner's first "মিলিয়ে নিন" on day 1, before any transaction.
// Without it every account would start at 0 and cash would go negative over 60 days of stock buying.
{
  const { error } = await db.from("money_counts").insert([["cash", 40000], ["bank", 38000], ["bkash", 7900]].map(([account, counted]) => (
    { shop_id: shopId, account, counted, expected: 0, note: "seed: শুরুর হিসাব", counted_at: at(dhakaDay(-(DAYS - 1)).iso, 7, 0) })));
  if (error) throw new Error(`insert opening money failed: ${error.message}`);
}

// ── 3. Simulate each day, oldest first ──
let txnCount = 0;
for (let offset = -(DAYS - 1); offset <= 0; offset++) {
  const { iso, dayOfMonth } = dhakaDay(offset);
  const isToday = offset === 0;
  const lastHour = isToday ? TODAY_HOUR : 21; // today: only up to now
  if (isToday && lastHour < 9) break;
  const factor = dayFactor(offset);
  const daysLeft = -offset;

  // Morning restock: buy ~12 days of demand when stock is under ~5 days.
  const buy: Item[] = [];
  for (const p of products) {
    const lowWindow = p.seed_low_stock && daysLeft < LOW_STOCK_WINDOW;
    let qty = 0;
    if (p.seed_low_stock && daysLeft === LOW_STOCK_WINDOW) {
      // last delivery = expected demand from yesterday to now + ~2 days, so it ends near "২ দিন চলবে"
      const target = expectedDemand(p, offset, 0) + p.seed_avg_daily_sales * LOW_STOCK_TARGET_DAYS;
      qty = Math.max(0, Math.round(target - p.stock));
    } else if (!lowWindow && p.stock < p.seed_avg_daily_sales * 5) {
      qty = Math.ceil(p.seed_avg_daily_sales * 12);
      // low-stock products: don't overfill before their last delivery (arrive with ~1 day left)
      if (p.seed_low_stock) {
        const untilWindow = expectedDemand(p, offset, -LOW_STOCK_WINDOW - 1) + p.seed_avg_daily_sales;
        qty = Math.min(qty, Math.max(0, Math.ceil(untilWindow - p.stock)));
      }
    }
    if (qty > 0) { buy.push({ product_id: p.id, quantity: qty, unit_price: p.cost_price }); p.stock += qty; }
  }
  if (buy.length) {
    const total = buy.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const credit = supplierPlan[0]?.due && supplierPlan[0].day <= offset ? supplierPlan.shift()! : null;
    const supplier = credit ? suppliers[credit.supplier] : null;
    const due = supplier ? Math.min(credit!.due!, total) : 0;
    if (supplier) supplier.due += due;
    await apply({
      type: "purchase", items: buy, paid: total - due, supplier_id: supplier?.id ?? null,
      occurred_at: at(iso, 8, 30), raw_text: supplier ? `seed: ${supplier.name} থেকে বাকিতে কেনা` : "seed: পাইকারি কেনা",
    });
    txnCount++;
  }

  // Paying a supplier back (দেনা শোধ), never more than what is owed.
  while (supplierPlan[0]?.pay && supplierPlan[0].day <= offset) {
    const { supplier: i, pay } = supplierPlan.shift()!;
    const amount = Math.min(pay!, suppliers[i].due);
    if (amount <= 0) continue;
    suppliers[i].due -= amount;
    await apply({ type: "payment", supplier_id: suppliers[i].id, paid: amount, occurred_at: at(iso, 11), raw_text: `seed: ${suppliers[i].name}-কে দেনা শোধ` });
    txnCount++;
  }

  // Sales: each product's daily quantity is spread over a few customer baskets.
  const basketCount = Math.max(1, poisson(9 * factor));
  const baskets: Map<string, Item>[] = Array.from({ length: basketCount }, () => new Map());
  for (const p of products) {
    let qty = Math.min(poisson(p.seed_avg_daily_sales * factor), p.stock); // can't sell what isn't there
    p.stock -= qty;
    while (qty-- > 0) {
      const b = pick(baskets);
      const line = b.get(p.id) ?? { product_id: p.id, quantity: 0, unit_price: p.sell_price };
      line.quantity++;
      b.set(p.id, line);
    }
  }
  for (const b of baskets) {
    if (!b.size) continue;
    const items = [...b.values()];
    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const onCredit = rand() < 0.2 && total >= 100;
    const customer = onCredit ? pick(customers) : null;
    const due = customer ? Math.min(total, round10(total * (0.3 + rand() * 0.7))) : 0;
    if (customer) customer.due += due;
    await apply({
      type: "sale", items, paid: total - due, customer_id: customer?.id ?? null,
      occurred_at: at(iso, 9 + Math.floor(rand() * (lastHour - 9 + 1))), raw_text: "seed: বিক্রি",
    });
    txnCount++;
  }

  // Some customers pay back part of their due.
  for (const c of customers) {
    if (c.due > 0 && rand() < 0.12) {
      const amount = Math.min(c.due, Math.max(10, round10(c.due * (0.5 + rand() * 0.5))));
      c.due -= amount;
      await apply({ type: "payment", customer_id: c.id, paid: amount, occurred_at: at(iso, Math.min(lastHour, 18)), raw_text: "seed: বাকি জমা" });
      txnCount++;
    }
  }

  // Shop expenses.
  const expenses: [string, number][] = [];
  if (dayOfMonth === 1) expenses.push(["দোকান ভাড়া", 5000]);
  if (dayOfMonth === 5) expenses.push(["বিদ্যুৎ বিল", 1400]);
  if (offset % 3 === 0) expenses.push(["চা-নাস্তা", 80 + Math.floor(rand() * 8) * 10]);
  if (offset % 10 === 0) expenses.push(["পরিবহন", 200]);
  for (const [category, amount] of expenses) {
    await apply({ type: "expense", total: amount, expense_category: category, occurred_at: at(iso, Math.min(lastHour, 20)), raw_text: `seed: ${category}` });
    txnCount++;
  }
}

// ── 4. Self-check: DB (computed by apply_transaction) must equal our own simulation ──
const { data: dbProducts } = await db.from("products").select("id, name_bn, stock_qty, reorder_level").eq("shop_id", shopId);
const { data: dbCustomers } = await db.from("customers").select("id, name, due_balance").eq("shop_id", shopId);
const stockMismatch = products.filter((p) => Number(dbProducts?.find((d) => d.id === p.id)?.stock_qty) !== p.stock);
const { data: dbSuppliers } = await db.from("suppliers").select("id, due_balance").eq("shop_id", shopId);
const dueMismatch = customers.filter((c) => Number(dbCustomers?.find((d) => d.id === c.id)?.due_balance) !== c.due);
const payableMismatch = suppliers.filter((s) => Number(dbSuppliers?.find((d) => d.id === s.id)?.due_balance) !== s.due);
if (supplierPlan.length) throw new Error(`Self-check FAILED: supplier plan not used: ${JSON.stringify(supplierPlan)}`);
if (stockMismatch.length || dueMismatch.length || payableMismatch.length) {
  throw new Error(`Self-check FAILED: stock ${stockMismatch.map((p) => p.name_bn)}, due ${dueMismatch.map((c) => c.name)}, দেনা ${payableMismatch.map((s) => s.name)}`);
}

const low = products.filter((p) => p.stock <= p.reorder_level)
  .map((p) => `${p.name_bn} ${p.stock} (≈${(p.stock / p.seed_avg_daily_sales).toFixed(1)} দিন)`);
const { data: today } = await db.from("today_summary").select("*").eq("shop_id", shopId).maybeSingle();
console.log(`Seeded ${products.length} products, ${customers.length} customers, ${suppliers.length} suppliers, ${txnCount} transactions over ${DAYS} days`);
console.log(`Self-check passed: stock, dues and দেনা in the DB match the simulation`);
console.log(`Total due: ৳${customers.reduce((s, c) => s + c.due, 0)}`);
console.log(`Total দেনা: ৳${suppliers.reduce((s, x) => s + x.due, 0)} (${suppliers.map((x) => `${x.name} ${x.due}`).join(", ")})`);
console.log(`Low stock: ${low.join(", ") || "none"}`);
console.log(`today_summary: ${JSON.stringify(today)}`);
if (!process.env.DEMO_SHOP_ID) console.log(`\nNEW DEMO_SHOP_ID=${shopId}  ← put this in .env.local (and in Vercel)`);
