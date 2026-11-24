// One extracted entry → a draft for the confirm card. Pure: no AI, no DB. The LLM only said the
// values; every amount, unit conversion and stock change here is computed, and the DB recomputes on save.
import type { Entry, Extraction } from "../schema.ts";
import { deriveAmounts, keepSaidMoney, perUnitSaid } from "./amounts.ts";
import { matchCustomer, matchProduct } from "./matchProduct.ts";
import { resolveUnit, saidContainer } from "./units.ts";

export type ShopContext = {
  products: { id: string; name_bn: string; name_en: string | null; aliases: string[]; unit: string; sell_price: number; cost_price: number; stock_qty: number }[];
  customers: { id: string; name: string; due_balance: number }[];
  suppliers: { id: string; name: string; due_balance: number }[];
  lang: "bn" | "en";
};

const productNames = (p: ShopContext["products"][number]) => [p.name_bn, p.name_en ?? "", ...p.aliases];
const productCandidates = (ctx: ShopContext) => ctx.products.map((p) => ({ id: p.id, names: productNames(p) }));

// the owner's own "2 বোতল" beats an LLM unit copied from the pack size in the name
function withSaidContainer<T extends Entry["items"][number]>(it: T, p: ShopContext["products"][number] | undefined, input: string): T {
  const c = p ? saidContainer(input, productNames(p)) : null;
  return c ? { ...it, quantity: c.quantity, unit: c.unit as T["unit"] } : it;
}

// "আজ সকালে গুনে দেখলাম চাল ৪০ কেজি" → counted 40 kg; change = counted − stock (preview; apply_stock_count recomputes)
export function stockCountDraft(entry: Entry, ctx: ShopContext, input = "") {
  const first = entry.items[0];
  const product = first ? ctx.products.find((p) => p.id === matchProduct(first.product, productCandidates(ctx))) : undefined;
  const said = first && withSaidContainer(first, product, input);
  const r = product ? resolveUnit(said.quantity, said.unit, { unit: product.unit, names: [product.name_bn, product.name_en ?? ""] }) : null;
  const counted = r ? r.quantity : (said?.quantity ?? null);
  const stock_before = product ? Number(product.stock_qty) : null;
  const missing = [...(product ? [] : ["items" as const]), ...(counted == null ? ["quantity" as const] : [])];
  return {
    type: "stock_count" as const,
    days_ago: entry.days_ago_said ?? 0,
    product: product?.name_bn ?? said?.product ?? "",
    product_id: product?.id ?? null,
    unit: product?.unit ?? said?.unit ?? null,
    counted,
    stock_before,
    change: counted != null && stock_before != null ? Math.round((counted - stock_before) * 100) / 100 : null,
    ask_count: r?.ask_count ?? null, // "৫ লিটার" of 2 L bottles → "কত বোতল?"
    missing,
  };
}

export function transactionDraft(entry: Entry & { type: Extraction["type"] }, ctx: ShopContext, input: string) {
  const said = perUnitSaid(keepSaidMoney(entry, input), input); // the LLM may not invent money; "করে" = per unit
  const candidates = productCandidates(ctx);
  // spoken unit → product unit before the money math, so price = total ÷ the converted quantity
  const asks: ("bottle" | "packet" | null)[] = [];
  const x = {
    ...said,
    items: said.items.map((raw) => {
      const p = ctx.products.find((q) => q.id === matchProduct(raw.product, candidates));
      const it = withSaidContainer(raw, p, input);
      const r = p ? resolveUnit(it.quantity, it.unit, { unit: p.unit, names: [p.name_bn, p.name_en ?? ""] }) : null;
      asks.push(r?.ask_count ?? null);
      if (!r) return it; // e.g. "2 প্যাকেট" of a per-kg dal: kept as said, the card asks
      return { ...it, quantity: r.quantity, unit: r.unit as typeof it.unit, unit_price_said: it.unit_price_said != null ? Math.round(it.unit_price_said * r.scale * 100) / 100 : null };
    }),
  };
  const amounts = deriveAmounts(x);
  const customerId = x.customer ? matchCustomer(x.customer, ctx.customers.map((c) => ({ id: c.id, names: [c.name] }))) : null;
  const supplierId = x.supplier ? matchCustomer(x.supplier, ctx.suppliers.map((s) => ({ id: s.id, names: [s.name] }))) : null;
  const supplier = supplierId ? ctx.suppliers.find((s) => s.id === supplierId)! : null;

  const draft = {
    type: x.type,
    days_ago: entry.days_ago_said ?? 0,
    items: amounts.items.map((it, i) => {
      const product_id = matchProduct(it.product, candidates);
      const product = ctx.products.find((p) => p.id === product_id);
      // matched → use the shop's own name and unit; stock_before feeds the "what will change" preview
      return {
        ...it,
        product: product?.name_bn ?? it.product,
        unit: it.unit ?? product?.unit ?? null,
        product_id,
        is_new: product_id === null,
        stock_before: product ? Number(product.stock_qty) : null,
        product_unit: product?.unit ?? null, // spoken unit can differ ("2 packet" of a per-kg dal): the card asks, never converts
        ask_count: asks[i], // "৩ লিটার" of a 2 L bottle → the card asks "কত বোতল?"
        // offered as a quick answer when the price wasn't said; never filled in silently
        list_price: product ? Number(x.type === "purchase" ? product.cost_price : product.sell_price) : null,
      };
    }),
    customer: customerId ? ctx.customers.find((c) => c.id === customerId)!.name : x.customer,
    customer_id: customerId,
    due_before: customerId ? Number(ctx.customers.find((c) => c.id === customerId)!.due_balance) : null,
    customer_is_new: Boolean(x.customer) && customerId === null,
    supplier: supplier?.name ?? x.supplier,
    supplier_id: supplierId,
    supplier_due_before: supplier ? Number(supplier.due_balance) : null,
    total: amounts.total,
    paid: amounts.paid,
    received: x.paid_said, // cash the customer said they handed over (for ফেরত), as said
    due: amounts.due,
    ask_paid: amounts.ask_paid,
    method: x.method,
    expense_category: x.expense_category,
    missing: amounts.missing,
    warnings: amounts.warnings,
    // the backend decides what is missing; the LLM only supplies the wording
    clarify_question: amounts.missing.length ? x.clarify_question : null,
  };
  return { draft, extracted: x };
}

export type TransactionDraft = ReturnType<typeof transactionDraft>["draft"];
export type StockCountDraft = ReturnType<typeof stockCountDraft>;

export function buildDraft(entry: Entry, ctx: ShopContext, input: string): { draft: TransactionDraft | StockCountDraft; extracted: Entry } {
  if (entry.type === "stock_count") return { draft: stockCountDraft(entry, ctx, input), extracted: entry };
  const r = transactionDraft({ ...entry, type: entry.type }, ctx, input);
  return { draft: r.draft, extracted: { ...entry, ...r.extracted } };
}
