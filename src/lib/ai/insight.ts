// Verified numbers → AI wording (today line, 5 month bullets, 3 tips) → number check.
// Any section whose numbers don't match, or all of it if both AIs fail, falls back to a template from
// the same real numbers, marked ai: false so the UI labels it "not AI". Never a canned AI answer.
import { z } from "zod";
import { callLLM } from "./provider.ts";
import { insightSystemPrompt } from "./prompts.ts";
import { allowedNumbers, numbersOk } from "../logic/numberCheck.ts";
import type { InsightNumbers } from "../db/queries.ts";
import { dictionary, type Lang } from "../../i18n/dictionary.ts";
import { formatNumber, formatTaka } from "../format.ts";

const Reply = z.object({
  today: z.string().min(1).max(400),
  bullets: z.array(z.string().min(1).max(300)).min(3).max(6),
  next: z.array(z.string().min(1).max(300)).min(1).max(4),
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
    low_stock: n.lowStock.map((p) => ({ name: name(p.id), days_left: p.daysLeft })),
  };
}
type Facts = ReturnType<typeof insightFacts>;

function template(f: Facts, lang: Lang) {
  const t = dictionary[lang].insight, taka = (x: number) => formatTaka(x, lang), num = (x: number) => formatNumber(x, lang);
  const list = (xs: string[]) => xs.join(t.and);
  const pct = f.month.sales_change_pct;
  const top = [...f.month.top_products].sort((a, b) => b.profit - a.profit)[0];
  return {
    today: f.today.sales > 0 ? t.tTodaySales(taka(f.today.sales), taka(f.today.yesterday_same_time_sales)) : t.tTodayNone,
    bullets: [
      t.tSales(taka(f.month.sales), pct === null ? null : num(Math.abs(pct)), (pct ?? 0) >= 0),
      t.tProfit(taka(f.month.profit), num(f.month.margin_pct ?? 0)),
      t.tTop(list(f.month.top_products.slice(0, 2).map((p) => p.name))),
      t.tDue(taka(f.total_due), taka(f.old_due.total), num(f.old_due.customers)),
      f.low_stock.length ? t.tLow(list(f.low_stock.slice(0, 3).map((p) => p.name))) : t.tNoLow,
    ],
    next: [
      ...(f.low_stock.length ? [t.tNextBuy(list(f.low_stock.slice(0, 3).map((p) => p.name)))] : []),
      ...(f.old_due.total > 0 ? [t.tNextCollect(taka(f.old_due.total))] : []),
      ...(top ? [t.tNextTop(top.name)] : []),
    ],
  };
}

export async function insight(n: InsightNumbers, lang: Lang) {
  const facts = insightFacts(n, lang);
  const fallback = template(facts, lang);
  let reply: z.infer<typeof Reply> | null = null, provider: string | null = null;
  try {
    const r = await callLLM({ system: insightSystemPrompt(lang), user: JSON.stringify(facts), jsonSchema: ReplyJsonSchema },
      (raw) => Reply.parse(JSON.parse(raw)));
    reply = r.data; provider = `${r.provider}/${r.model}`;
  } catch (e) {
    console.error("insight AI failed:", (e as Error).message); // falls back to the template below
  }
  const allowed = allowedNumbers(facts);
  const ok = (xs: string[]) => xs.every((x) => numbersOk(x, allowed));
  const section = (ai: string[] | undefined, tpl: string[]) => (ai && ok(ai) ? { items: ai, ai: true } : { items: tpl, ai: false });
  return {
    monthName: facts.month_name,
    provider,
    today: section(reply ? [reply.today] : undefined, [fallback.today]),
    bullets: section(reply?.bullets.slice(0, 5), fallback.bullets),
    next: section(reply?.next.slice(0, 3), fallback.next),
  };
}
export type InsightText = Awaited<ReturnType<typeof insight>>;
