// Sentence → validated draft transaction. Never writes to the DB (the owner confirms first).
import { Extraction, ExtractionJsonSchema } from "../schema.ts";
import { normalizeInput } from "../logic/normalize.ts";
import { deriveAmounts } from "../logic/amounts.ts";
import { matchCustomer, matchProduct } from "../logic/matchProduct.ts";
import { extractionSystemPrompt } from "./prompts.ts";
import { callLLM } from "./provider.ts";

export type ShopContext = {
  products: { id: string; name_bn: string; name_en: string | null; aliases: string[]; unit: string; sell_price: number; stock_qty: number }[];
  customers: { id: string; name: string; due_balance: number }[];
  suppliers: { id: string; name: string; due_balance: number }[];
  lang: "bn" | "en";
};

export async function extract(text: string, ctx: ShopContext) {
  const input = normalizeInput(text);
  const llm = await callLLM(
    {
      system: extractionSystemPrompt(ctx.products, ctx.customers.map((c) => c.name), ctx.lang, ctx.suppliers.map((s) => s.name)),
      user: input,
      jsonSchema: ExtractionJsonSchema,
    },
    (raw) => Extraction.parse(JSON.parse(raw)),
  );

  const x = llm.data;
  const amounts = deriveAmounts(x);
  const productCandidates = ctx.products.map((p) => ({ id: p.id, names: [p.name_bn, p.name_en ?? "", ...p.aliases] }));
  const customerId = x.customer ? matchCustomer(x.customer, ctx.customers.map((c) => ({ id: c.id, names: [c.name] }))) : null;
  const supplierId = x.supplier ? matchCustomer(x.supplier, ctx.suppliers.map((s) => ({ id: s.id, names: [s.name] }))) : null;
  const supplier = supplierId ? ctx.suppliers.find((s) => s.id === supplierId)! : null;

  const draft = {
    type: x.type,
    items: amounts.items.map((it) => {
      const product_id = matchProduct(it.product, productCandidates);
      const product = ctx.products.find((p) => p.id === product_id);
      // matched → use the shop's own name and unit; stock_before feeds the "what will change" preview
      return {
        ...it,
        product: product?.name_bn ?? it.product,
        unit: it.unit ?? product?.unit ?? null,
        product_id,
        is_new: product_id === null,
        stock_before: product ? Number(product.stock_qty) : null,
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

  return { input, draft, extracted: x, provider: llm.provider, model: llm.model, latency_ms: llm.latency_ms };
}
