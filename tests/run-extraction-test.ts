// Live accuracy test for AI extraction (real Gemini/Groq calls, throttled for free tiers).
// Run: npm run test:extract   (optional: npm run test:extract -- 5 12  → only those case ids)
// A case is correct only if type, customer, every item (product, quantity, unit price),
// total/paid/due and missing all match. Network/provider failures are counted separately.
import { readFileSync, writeFileSync } from "node:fs";
import { extract } from "../src/lib/ai/extract.ts";
import { loadShopContext } from "../src/lib/db/queries.ts";

type ExpectItem = { product: string; quantity: number; unit_price: number | null };
type Case = {
  id: number; category: string; text: string;
  expect: { type: string; customer: string | null; items: ExpectItem[]; total: number | null; paid?: number; due?: number; missing?: string[] };
};

// Default ≈15 calls/min suits Gemini. Groq free tier allows ~8000 input tokens/min and one call is
// ~2,300 tokens, so a Groq-only run needs THROTTLE_MS=22000.
const THROTTLE_MS = Number(process.env.THROTTLE_MS ?? 4000);
const cases: Case[] = JSON.parse(readFileSync(new URL("./banglish-cases.json", import.meta.url), "utf8"));
const only = process.argv.slice(2).map(Number);
const selected = only.length ? cases.filter((c) => only.includes(c.id)) : cases;

const ctx = await loadShopContext("bn");
const productName = new Map(ctx.products.map((p) => [p.id, p.name_bn]));
const customerName = new Map(ctx.customers.map((c) => [c.id, c.name]));
const eq = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == b : Math.abs(a - b) < 0.01;

const results = [];
let correct = 0, errors = 0;
for (const [i, c] of selected.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, THROTTLE_MS));
  try {
    const r = await extract(c.text, ctx);
    const d = r.draft;
    const problems: string[] = [];
    if (d.type !== c.expect.type) problems.push(`type ${d.type}≠${c.expect.type}`);
    const cust = d.customer_id ? customerName.get(d.customer_id) : null;
    if ((cust ?? null) !== c.expect.customer) problems.push(`customer ${cust ?? d.customer}≠${c.expect.customer}`);
    if (d.items.length !== c.expect.items.length) problems.push(`items ${d.items.length}≠${c.expect.items.length}`);
    for (const want of c.expect.items) {
      const got = d.items.find((it) => (it.is_new ? "__new__" : productName.get(it.product_id!)) === want.product);
      if (!got) { problems.push(`missing item ${want.product}`); continue; }
      if (!eq(got.quantity, want.quantity)) problems.push(`${want.product} qty ${got.quantity}≠${want.quantity}`);
      if (!eq(got.unit_price, want.unit_price)) problems.push(`${want.product} price ${got.unit_price}≠${want.unit_price}`);
    }
    if (!eq(d.total, c.expect.total)) problems.push(`total ${d.total}≠${c.expect.total}`);
    if (c.expect.paid !== undefined && !eq(d.paid, c.expect.paid)) problems.push(`paid ${d.paid}≠${c.expect.paid}`);
    if (c.expect.due !== undefined && !eq(d.due, c.expect.due)) problems.push(`due ${d.due}≠${c.expect.due}`);
    const wantMissing = c.expect.missing ?? [];
    if ([...d.missing].sort().join() !== [...wantMissing].sort().join()) problems.push(`missing ${JSON.stringify(d.missing)}≠${JSON.stringify(wantMissing)}`);

    const ok = problems.length === 0;
    if (ok) correct++;
    console.log(`${ok ? "✔" : "✘"} #${c.id} [${r.provider} ${r.latency_ms}ms] ${c.text}${ok ? "" : `\n    ${problems.join("; ")}`}`);
    results.push({ id: c.id, category: c.category, ok, problems, provider: r.provider, latency_ms: r.latency_ms, draft: d });
  } catch (e) {
    errors++;
    console.log(`⚠ #${c.id} ERROR (not scored as wrong): ${(e as Error).message.slice(0, 160)}`);
    results.push({ id: c.id, category: c.category, ok: false, error: (e as Error).message });
  }
}

const answered = selected.length - errors;
const pct = answered ? ((correct / answered) * 100).toFixed(1) : "0";
const providers: Record<string, number> = {};
for (const r of results) { const p = r.provider ?? "error"; providers[p] = (providers[p] ?? 0) + 1; }
console.log(`\nAccuracy: ${correct}/${answered} = ${pct}%  (errors: ${errors}, providers: ${JSON.stringify(providers)})`);
writeFileSync(new URL("./results.json", import.meta.url),
  JSON.stringify({ ran_at: new Date().toISOString(), correct, answered, errors, accuracy_pct: Number(pct), providers, results }, null, 2));
