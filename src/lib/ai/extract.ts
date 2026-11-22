// Sentence → validated draft transaction. Never writes to the DB (the owner confirms first).
import { Extraction, ExtractionJsonSchema } from "../schema.ts";
import { normalizeInput } from "../logic/normalize.ts";
import { deriveAmounts } from "../logic/amounts.ts";
import { matchCustomer, matchProduct } from "../logic/matchProduct.ts";
import { extractionSystemPrompt } from "./prompts.ts";
import { callLLM } from "./provider.ts";

export type ShopContext = {
  products: { id: string; name_bn: string; name_en: string | null; aliases: string[]; unit: string; sell_price: number }[];
  customers: { id: string; name: string }[];
  lang: "bn" | "en";
};

export async function extract(text: string, ctx: ShopContext) {
  const input = normalizeInput(text);
  const llm = await callLLM(
    {
      system: extractionSystemPrompt(ctx.products, ctx.customers.map((c) => c.name), ctx.lang),
      user: input,
      jsonSchema: ExtractionJsonSchema,
    },
    (raw) => Extraction.parse(JSON.parse(raw)),
  );

  const x = llm.data;
  const amounts = deriveAmounts(x);
  const productCandidates = ctx.products.map((p) => ({ id: p.id, names: [p.name_bn, p.name_en ?? "", ...p.aliases] }));
  const customerId = x.customer ? matchCustomer(x.customer, ctx.customers.map((c) => ({ id: c.id, names: [c.name] }))) : null;

  const draft = {
    type: x.type,
    items: amounts.items.map((it) => {
      const product_id = matchProduct(it.product, productCandidates);
      return { ...it, product_id, is_new: product_id === null };
    }),
    customer: x.customer,
    customer_id: customerId,
    customer_is_new: Boolean(x.customer) && customerId === null,
    total: amounts.total,
    paid: amounts.paid,
    due: amounts.due,
    expense_category: x.expense_category,
    missing: amounts.missing,
    warnings: amounts.warnings,
    // the backend decides what is missing; the LLM only supplies the wording
    clarify_question: amounts.missing.length ? x.clarify_question : null,
  };

  return { input, draft, extracted: x, provider: llm.provider, model: llm.model, latency_ms: llm.latency_ms };
}
