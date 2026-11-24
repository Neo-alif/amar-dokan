// Sentence → validated draft entries (one per event said). Never writes to the DB (the owner confirms first).
import { MultiExtraction, ExtractionJsonSchema } from "../schema.ts";
import { normalizeInput } from "../logic/normalize.ts";
import { buildDraft, type ShopContext } from "../logic/drafts.ts";
import { extractionSystemPrompt } from "./prompts.ts";
import { callLLM } from "./provider.ts";

export type { ShopContext };

export async function extract(text: string, ctx: ShopContext) {
  const input = normalizeInput(text);
  const llm = await callLLM(
    {
      system: extractionSystemPrompt(ctx.products, ctx.customers.map((c) => c.name), ctx.lang, ctx.suppliers.map((s) => s.name)),
      user: input,
      jsonSchema: ExtractionJsonSchema,
    },
    (raw) => MultiExtraction.parse(JSON.parse(raw)),
  );

  const built = llm.data.entries.map((e) => buildDraft(e, ctx, input));
  return {
    input,
    drafts: built.map((b) => b.draft),
    extracted: { entries: built.map((b) => b.extracted) },
    provider: llm.provider, model: llm.model, latency_ms: llm.latency_ms,
  };
}
