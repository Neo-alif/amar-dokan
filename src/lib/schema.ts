// What the LLM must return. It copies only values the speaker actually SAID;
// totals, paid and due are computed by lib/logic/amounts.ts, never by the LLM.
// One Zod schema drives both Gemini structured output (via toJSONSchema) and validation.
import { z } from "zod";

export const UNITS = ["pcs", "kg", "g", "litre", "ml", "dozen", "packet", "bottle"] as const;
// supplier_payment = the shop pays a supplier back (দেনা শোধ); saved as a DB payment with supplier_id
export const TXN_TYPES = ["sale", "purchase", "expense", "payment", "supplier_payment", "unknown"] as const;
export const METHODS = ["cash", "bkash", "bank"] as const; // how money moved; cash is the default

const said = (what: string) => z.number().nonnegative().nullable().describe(`${what}, only if the speaker said it, else null`);

export const ExtractedItem = z.object({
  product: z.string().min(1).describe("product name; use the exact name from the shop's product list when it clearly matches"),
  quantity: z.number().positive().nullable().describe("quantity as said, else null"),
  unit: z.enum(UNITS).nullable().describe("unit word as said (ta/pis → pcs, botol → bottle), never converted, else null"),
  unit_price_said: said("price per one unit"),
  line_total_said: said("money for this item line"),
});

export const Extraction = z.object({
  type: z.enum(TXN_TYPES),
  items: z.array(ExtractedItem).describe("products for sale/purchase; empty for expense/payment"),
  customer: z.string().nullable().describe("customer name; use the exact name from the customer list when it clearly matches"),
  supplier: z.string().nullable().describe("supplier/wholesaler the shop bought from or paid back; use the exact name from the supplier list when it clearly matches; else null"),
  total_said: said("total money of the whole transaction"),
  paid_said: said("money paid now"),
  due_said: said("money left as baki/due"),
  method: z.enum(METHODS).nullable().describe("how the money moved, only if said: bkash/bikash/বিকাশ → bkash, bank/check/ব্যাংক → bank, else null"),
  expense_category: z.string().nullable().describe("for expense: what it was for (e.g. বিদ্যুৎ বিল), else null"),
  clarify_question: z.string().nullable().describe("one short question in the user's language if something needed is missing, else null"),
  confidence: z.number().min(0).max(1),
});

// One message can hold several events ("kal Rahim ke…, ar Karim ke…, aj gune dekhlam chal 40 kg"):
// each is one entry. stock_count = the owner counted a product; items[].quantity is the counted qty.
export const MAX_DAYS_AGO = 31;
export const ENTRY_TYPES = [...TXN_TYPES, "stock_count"] as const;
export const Entry = Extraction.extend({
  type: z.enum(ENTRY_TYPES),
  days_ago_said: z.number().int().min(0).max(MAX_DAYS_AGO).nullable()
    .describe("when it happened, only if said: aj/আজ → 0, gotokal/গতকাল/kal (past) → 1, porshu/পরশু → 2, '3 din age' → 3; else null"),
});
export const MultiExtraction = z.object({ entries: z.array(Entry).min(1).max(10) });

export type ExtractedItem = z.infer<typeof ExtractedItem>;
export type Extraction = z.infer<typeof Extraction>;
export type Entry = z.infer<typeof Entry>;

export const ExtractionJsonSchema = z.toJSONSchema(MultiExtraction);
