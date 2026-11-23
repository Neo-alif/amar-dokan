// Verified numbers → AI wording (today line, 5 month bullets, 3 tips) → number check.
// A reply with a wrong number or a raw JSON key counts as that model failing, so the next model is tried.
// If every model fails we return null and the UI says AI is unavailable. No template, no canned answer.
import { z } from "zod";
import { callLLM } from "./provider.ts";
import { insightSystemPrompt } from "./prompts.ts";
import { allowedNumbers, numbersIn } from "../logic/numberCheck.ts";
import type { InsightNumbers } from "../db/queries.ts";
import type { Lang } from "../../i18n/dictionary.ts";

const Reply = z.object({
  today: z.string().min(1).max(400),
  bullets: z.array(z.string().min(1).max(300)).min(3).max(6),
  next: z.array(z.object({ tip: z.string().min(1).max(300), why: z.string().min(1).max(200) })).min(1).max(4),
});
const ReplyJsonSchema = z.toJSONSchema(Reply);

// What the LLM sees: names in the owner's language, money rounded to whole taka.
export function insightFacts(n: InsightNumbers, lang: Lang) {
  const name = (id: string) => n.names[id]?.[lang] ?? "";
  const R = Math.round;
  return {
    month_name: new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { month: "long", timeZone: "Asia/Dhaka" }).format(new Date(n.month.monthStart)),
    today: {
      sales: R(n.today.sales), yesterday_same_time_sales: R(n.today.yesterdaySameTime),
      sales_change_pct: n.today.changePct, spend: R(n.today.spend), top_products: n.today.top3.map(name),
    },
    month: {
      sales: R(n.month.sales), last_month_same_point_sales: R(n.month.lastMonthSales), sales_change_pct: n.month.salesChangePct,
      profit: R(n.month.profit), margin_pct: n.month.marginPct, spend: R(n.month.spend),
      top_products: n.month.top5.map((p) => ({ name: name(p.id), sales: R(p.sales), profit: R(p.profit) })),
    },
    total_due: R(n.totalDue),
    old_due: { older_than_days: 7, customers: n.oldDue.customers, total: R(n.oldDue.total) },
    // 5 most urgent only: keeps the prompt small (~650 tokens) for Groq's free token limits
    low_stock: n.lowStock.slice(0, 5).map((p) => ({ name: name(p.id), days_left: p.daysLeft })),
  };
}

// Throws (→ next model) if any line has a number not in the facts or a raw key like "days_left".
function checkLines(lines: string[], allowed: Set<number>) {
  for (const x of lines) {
    if (/[a-z]+_[a-z]+/i.test(x)) throw new Error(`raw key in text: ${x}`);
    const bad = numbersIn(x).filter((v) => !allowed.has(v));
    if (bad.length) throw new Error(`number check failed: ${bad.join(",")} in: ${x}`);
  }
}

export async function insight(n: InsightNumbers, lang: Lang, signal?: AbortSignal) {
  const facts = insightFacts(n, lang);
  const allowed = allowedNumbers(facts);
  const parse = (raw: string) => {
    const r = Reply.parse(JSON.parse(raw));
    checkLines([r.today, ...r.bullets.slice(0, 5), ...r.next.slice(0, 3).flatMap((x) => [x.tip, x.why])], allowed);
    return r;
  };
  try {
    const r = await callLLM({ system: insightSystemPrompt(lang), user: JSON.stringify(facts), jsonSchema: ReplyJsonSchema }, parse, signal);
    // bn: show any ASCII digits the model slipped in as Bangla digits (same numbers, already checked)
    const digits = (x: string) => (lang === "bn" ? x.replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]) : x);
    return {
      monthName: facts.month_name,
      model: r.model,
      today: digits(r.data.today),
      bullets: r.data.bullets.slice(0, 5).map(digits),
      next: r.data.next.slice(0, 3).map((x) => ({ tip: digits(x.tip), why: digits(x.why) })),
    };
  } catch (e) {
    console.error("insight AI failed:", (e as Error).message);
    return null;
  }
}
export type InsightText = NonNullable<Awaited<ReturnType<typeof insight>>>;
