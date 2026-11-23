// Deterministic money math for a draft transaction. The LLM only reports what was said;
// everything here is computed. The DB (apply_transaction) recomputes and validates again on save.
import type { Extraction } from "../schema";

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
    return { items: [], total: amount, paid: amount, due: 0, missing, warnings };
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

  // Nothing said about payment → a cash sale: paid in full, no due.
  let due = x.due_said ?? (x.paid_said != null && total != null ? r2(total - x.paid_said) : 0);
  if (due < 0) { warnings.push("PAID_EXCEEDS_TOTAL"); due = 0; }
  const paid = x.paid_said ?? (total != null ? r2(total - due) : null);
  if (x.paid_said != null && x.due_said != null && total != null && Math.abs(x.paid_said + x.due_said - total) > 0.5) {
    warnings.push("PAID_DUE_MISMATCH");
  }
  // baki on a sale = the customer owes (পাওনা); on a purchase = the shop owes the supplier (দেনা)
  if (due > 0 && x.type === "purchase" && !x.supplier) missing.push("supplier");
  if (due > 0 && x.type !== "purchase" && !x.customer) missing.push("customer");

  return { items, total, paid, due, missing, warnings };
}
