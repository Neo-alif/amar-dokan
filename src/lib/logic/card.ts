// ConfirmCard state → live totals and blocking problems. Preview only: the server re-validates
// and the DB recomputes every number on save.
import type { ErrorCode } from "../../i18n/dictionary";
import type { METHODS } from "../schema";

export type Method = (typeof METHODS)[number];

export type CardType = "sale" | "purchase" | "expense" | "payment" | "supplier_payment" | "unknown";
export type CardItem = {
  product_id: string | null;
  name: string;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  stock_before: number | null;
  product_unit?: string | null; // the shop's unit for a matched product (stock is counted in it)
  price_from_list?: boolean; // owner picked "তালিকার দাম" (not said, not AI) → small label on the card
};
export type Card = {
  type: CardType;
  method: Method;          // cash (default) · bkash · bank: which money account moves
  customer_id: string | null;
  customer_name: string;
  due_before: number | null;
  supplier_id: string | null;          // purchase on credit / supplier_payment
  supplier_name: string;
  supplier_due_before: number | null;  // দেনা before this transaction
  items: CardItem[];
  due: number;            // sale: customer baki (পাওনা) · purchase: owed to the supplier (দেনা)
  all_due: boolean;        // "পুরোটাই বাকি" → baki follows the total until the owner edits it
  received: number | null; // sale only: cash the customer handed over, if said → ফেরত (shown, not saved)
  paid_unknown: boolean;   // sale/purchase: payment not said → owner answers "কত টাকা দিয়েছে?" before saving
  amount: number | null;  // expense / payment
  expense_category: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
export const isAmountType = (t: CardType) => t === "expense" || t === "payment" || t === "supplier_payment"; // one amount, no items
const itemsComplete = (c: Card) =>
  c.items.length > 0 && c.items.every((i) => i.name.trim() && i.quantity != null && i.quantity > 0 && i.unit_price != null);

export function cardTotals(c: Card): { total: number | null; paid: number | null; due: number } {
  if (isAmountType(c.type)) return { total: c.amount, paid: c.amount, due: 0 };
  const total = itemsComplete(c) ? r2(c.items.reduce((s, i) => s + i.quantity! * i.unit_price!, 0)) : null;
  const due = c.type !== "sale" && c.type !== "purchase" ? 0 : c.all_due ? (total ?? 0) : c.due;
  return { total, paid: total != null ? r2(total - due) : null, due };
}

// ফেরত = cash handed over − what this sale takes. Only when the customer's cash was said or typed.
export function cardChange(c: Card): number | null {
  const { paid } = cardTotals(c);
  if (c.type !== "sale" || c.received == null || paid == null) return null;
  const change = r2(c.received - paid);
  return change > 0 ? change : null;
}

// Spoken unit vs the product's unit. pcs/packet are both counts ("2 ta biskut" = 2 packets); anything
// else that differs (packet vs kg, pcs vs dozen, g vs kg) is asked, never converted silently.
const COUNT = ["pcs", "packet"];
export function unitMismatch(it: { unit: string | null; product_unit?: string | null }): boolean {
  const { unit, product_unit } = it;
  return Boolean(unit && product_unit && unit !== product_unit && !(COUNT.includes(unit) && COUNT.includes(product_unit)));
}

// Answer to "এক প্যাকেটে কত কেজি?": quantity moves to the product's unit, money stays the same.
// A said price was per spoken unit → ÷ perUnit; a list price is already per product unit.
export function answerUnit(it: CardItem, perUnit: number): Partial<CardItem> {
  return {
    unit: it.product_unit ?? it.unit,
    quantity: it.quantity != null ? r2(it.quantity * perUnit) : null,
    unit_price: it.unit_price != null && !it.price_from_list ? r2(it.unit_price / perUnit) : it.unit_price,
  };
}

// "তালিকার দাম ৳X" quick answer: only when exactly one item lacks a price and it matched a product.
export function listPriceChoice(items: { unit_price: number | null; list_price: number | null }[]): { index: number; price: number } | null {
  const unpriced = items.flatMap((it, index) => (it.unit_price == null ? [{ index, price: it.list_price }] : []));
  return unpriced.length === 1 && unpriced[0].price != null && unpriced[0].price > 0 ? { index: unpriced[0].index, price: unpriced[0].price } : null;
}

// Answer to "কত টাকা দিয়েছে/দিলেন?": full → no baki · none → all baki · a number → baki = total − paid.
// A sale paid above the total keeps the extra as cash handed over, so ফেরত shows.
export function answerPaid(c: Card, answer: "full" | "none" | number): Partial<Card> {
  const done = { paid_unknown: false, received: null };
  if (answer === "full") return { ...done, due: 0, all_due: false };
  if (answer === "none") return { ...done, due: 0, all_due: true };
  const { total } = cardTotals({ ...c, due: 0, all_due: false });
  const due = total != null ? Math.max(0, r2(total - answer)) : 0;
  return { ...done, due, all_due: false, received: c.type === "sale" && total != null && answer > total ? answer : null };
}

export function cardProblems(c: Card): ErrorCode[] {
  const p: ErrorCode[] = [];
  const hasCustomer = c.customer_name.trim() !== "";
  if (c.type === "unknown") p.push("NEED_TYPE");
  if (c.type === "sale" || c.type === "purchase") {
    if (!itemsComplete(c)) p.push("NEED_ITEM_DETAILS");
    if (c.items.some(unitMismatch)) p.push("UNIT_MISMATCH");
    if (c.paid_unknown) p.push("NEED_PAID");
    const { total, due } = cardTotals(c);
    if (total != null && due > total) p.push("DUE_EXCEEDS_TOTAL");
    if (c.type === "sale" && (due > 0 || c.all_due) && !hasCustomer) p.push("CUSTOMER_REQUIRED_FOR_DUE");
    if (c.type === "purchase" && (due > 0 || c.all_due) && !c.supplier_name.trim()) p.push("SUPPLIER_REQUIRED_FOR_DUE");
  }
  if (isAmountType(c.type)) {
    if (!(c.amount != null && c.amount > 0)) p.push("AMOUNT_REQUIRED");
  }
  if (c.type === "payment") {
    if (!hasCustomer) p.push("CUSTOMER_REQUIRED");
    else if (c.due_before != null && c.amount != null && c.amount > c.due_before) p.push("PAYMENT_EXCEEDS_DUE");
  }
  if (c.type === "supplier_payment") {
    if (!c.supplier_name.trim()) p.push("SUPPLIER_REQUIRED");
    else if (c.supplier_due_before != null && c.amount != null && c.amount > c.supplier_due_before) p.push("SUPPLIER_PAYMENT_EXCEEDS_DUE");
  }
  return p;
}
