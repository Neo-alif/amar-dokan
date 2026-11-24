// Deterministic money math for a draft transaction. The LLM only reports what was said;
// everything here is computed. The DB (apply_transaction) recomputes and validates again on save.
import type { Extraction } from "../schema";
import { saidNumbers } from "./numberCheck.ts";

export type DraftItem = {
  product: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
};

export type Amounts = {
  items: DraftItem[];
  total: number | null;
  paid: number | null;
  due: number;
  ask_paid: boolean; // named customer/supplier but payment not said → the card asks, never assumes cash
  missing: ("type" | "items" | "quantity" | "price" | "amount" | "customer" | "supplier")[];
  warnings: ("TOTAL_MISMATCH" | "PAID_DUE_MISMATCH" | "PAID_EXCEEDS_TOTAL")[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function deriveAmounts(x: Extraction): Amounts {
  const missing: Amounts["missing"] = [];
  const warnings: Amounts["warnings"] = [];

  if (x.type === "expense" || x.type === "payment" || x.type === "supplier_payment") {
    const amount = x.type === "expense" ? (x.total_said ?? x.paid_said) : (x.paid_said ?? x.total_said);
    if (amount == null) missing.push("amount");
    if (x.type === "payment" && !x.customer) missing.push("customer");
    if (x.type === "supplier_payment" && !x.supplier) missing.push("supplier");
    return { items: [], total: amount, paid: amount, due: 0, ask_paid: false, missing, warnings };
  }

  if (x.type === "unknown") missing.push("type");

  const single = x.items.length === 1;
  const items: DraftItem[] = x.items.map((it) => {
    let unit_price = it.unit_price_said;
    if (unit_price == null && it.quantity) {
      // "2 ta tel 680 taka": a line or whole-sale total said → price per unit = total ÷ qty
      const said = it.line_total_said ?? (single ? x.total_said : null);
      if (said != null) unit_price = r2(said / it.quantity);
    }
    const line_total = it.quantity != null && unit_price != null ? r2(it.quantity * unit_price) : null;
    return { product: it.product, quantity: it.quantity, unit: it.unit, unit_price, line_total };
  });

  if (items.length === 0) missing.push("items");
  if (items.some((i) => i.quantity == null)) missing.push("quantity");
  if (items.some((i) => i.unit_price == null)) missing.push("price");

  const itemsTotal = items.length && items.every((i) => i.line_total != null)
    ? r2(items.reduce((s, i) => s + (i.line_total as number), 0))
    : null;
  const total = itemsTotal ?? x.total_said;
  if (itemsTotal != null && x.total_said != null && Math.abs(itemsTotal - x.total_said) > 0.5) warnings.push("TOTAL_MISMATCH");

  // Payment not said: a walk-in (no name) can only pay cash, since baki needs a name.
  // With a named customer/supplier we don't know → paid stays null and the card asks.
  const ask_paid = (x.type === "sale" || x.type === "purchase") && x.paid_said == null && x.due_said == null
    && Boolean(x.type === "sale" ? x.customer : x.supplier);
  let due = x.due_said ?? (x.paid_said != null && total != null ? r2(total - x.paid_said) : 0);
  if (due < 0) { warnings.push("PAID_EXCEEDS_TOTAL"); due = 0; }
  const paid = ask_paid ? null : x.paid_said ?? (total != null ? r2(total - due) : null);
  if (x.paid_said != null && x.due_said != null && total != null && Math.abs(x.paid_said + x.due_said - total) > 0.5) {
    warnings.push("PAID_DUE_MISMATCH");
  }
  // baki on a sale = the customer owes (পাওনা); on a purchase = the shop owes the supplier (দেনা)
  if (due > 0 && x.type === "purchase" && !x.supplier) missing.push("supplier");
  if (due > 0 && x.type !== "purchase" && !x.customer) missing.push("customer");

  return { items, total, paid, due, ask_paid, missing, warnings };
}

// Amounts said as per-unit: "৩৪০ টাকা করে", "340 taka kore", "76 each", "প্রতি বোতল ৩৪০", "per kg 76".
export function perUnitNumbers(text: string): Set<number> {
  const t = text.normalize("NFC").toLowerCase().replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/(\d),(?=\d)/g, "$1");
  const out = new Set<number>();
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(?:টাকা|taka|tk|৳)?\s*(?:করে|kore|each|প্রতিটা|প্রতিটি)/gu)) out.add(Number(m[1]));
  for (const m of t.matchAll(/(?:প্রতি|per)\s*[^\s\d]*\s*(\d+(?:\.\d+)?)/gu)) out.add(Number(m[1]));
  return out;
}

// Guard: the LLM sometimes files a "করে" price as the line/sale total ("২ বোতল তেল ৩৪০ টাকা করে" → ৳170 × 2).
// A number the owner said per unit always goes to unit_price_said; deriveAmounts then computes qty × price.
export function perUnitSaid(x: Extraction, text: string): Extraction {
  const per = perUnitNumbers(text);
  if (per.size === 0) return x;
  let total_said = x.total_said;
  const items = x.items.map((it) => {
    if (it.unit_price_said != null) return it;
    if (it.line_total_said != null && per.has(it.line_total_said)) return { ...it, unit_price_said: it.line_total_said, line_total_said: null };
    if (x.items.length === 1 && total_said != null && per.has(total_said)) {
      const price = total_said;
      total_said = null;
      return { ...it, unit_price_said: price };
    }
    return it;
  });
  return { ...x, items, total_said };
}

// Guard: a price/amount the LLM returns but the owner never said (e.g. copied from the product list
// in its context) is dropped, so the card asks "কত টাকায় দিলেন?" instead of trusting it. 0 = "puro baki".
export function keepSaidMoney(x: Extraction, text: string): Extraction {
  const said = saidNumbers(text);
  const keep = (n: number | null) => (n == null || n === 0 || said.has(n) ? n : null);
  return {
    ...x,
    items: x.items.map((it) => ({ ...it, unit_price_said: keep(it.unit_price_said), line_total_said: keep(it.line_total_said) })),
    total_said: keep(x.total_said),
    paid_said: keep(x.paid_said),
    due_said: keep(x.due_said),
  };
}
