// ConfirmCard state → live totals and blocking problems. Preview only: the server re-validates
// and the DB recomputes every number on save.
import type { ErrorCode } from "../../i18n/dictionary";

export type CardType = "sale" | "purchase" | "expense" | "payment" | "unknown";
export type CardItem = {
  product_id: string | null;
  name: string;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  stock_before: number | null;
};
export type Card = {
  type: CardType;
  customer_id: string | null;
  customer_name: string;
  due_before: number | null;
  items: CardItem[];
  due: number;            // sale only: money left as baki (what the owner says)
  all_due: boolean;
  received: number | null; // sale only: cash the customer handed over, if said → ফেরত (shown, not saved)       // sale only: "পুরোটাই বাকি" → baki follows the total until the owner edits it
  amount: number | null;  // expense / payment
  expense_category: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const itemsComplete = (c: Card) =>
  c.items.length > 0 && c.items.every((i) => i.name.trim() && i.quantity != null && i.quantity > 0 && i.unit_price != null);

export function cardTotals(c: Card): { total: number | null; paid: number | null; due: number } {
  if (c.type === "expense" || c.type === "payment") return { total: c.amount, paid: c.amount, due: 0 };
  const total = itemsComplete(c) ? r2(c.items.reduce((s, i) => s + i.quantity! * i.unit_price!, 0)) : null;
  const due = c.type !== "sale" ? 0 : c.all_due ? (total ?? 0) : c.due;
  return { total, paid: total != null ? r2(total - due) : null, due };
}

// ফেরত = cash handed over − what this sale takes. Only when the customer's cash was said or typed.
export function cardChange(c: Card): number | null {
  const { paid } = cardTotals(c);
  if (c.type !== "sale" || c.received == null || paid == null) return null;
  const change = r2(c.received - paid);
  return change > 0 ? change : null;
}

export function cardProblems(c: Card): ErrorCode[] {
  const p: ErrorCode[] = [];
  const hasCustomer = c.customer_name.trim() !== "";
  if (c.type === "unknown") p.push("NEED_TYPE");
  if (c.type === "sale" || c.type === "purchase") {
    if (!itemsComplete(c)) p.push("NEED_ITEM_DETAILS");
    const { total, due } = cardTotals(c);
    if (c.type === "sale" && total != null && due > total) p.push("DUE_EXCEEDS_TOTAL");
    if (c.type === "sale" && (due > 0 || c.all_due) && !hasCustomer) p.push("CUSTOMER_REQUIRED_FOR_DUE");
  }
  if (c.type === "expense" || c.type === "payment") {
    if (!(c.amount != null && c.amount > 0)) p.push("AMOUNT_REQUIRED");
  }
  if (c.type === "payment") {
    if (!hasCustomer) p.push("CUSTOMER_REQUIRED");
    else if (c.due_before != null && c.amount != null && c.amount > c.due_before) p.push("PAYMENT_EXCEEDS_DUE");
  }
  return p;
}
