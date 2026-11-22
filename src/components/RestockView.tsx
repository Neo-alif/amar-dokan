"use client";
// /restock screen (docs/mockup/Restock.dc.html): budget in → ranked buying list with reasons + budget bar.
// The list comes from restock.ts (deterministic), run here on the stock rows the server loaded.

import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import type { StockRow } from "@/lib/db/queries";
import { restock } from "@/lib/logic/restock";
import { formatNumber, formatTaka } from "@/lib/format";

const DEFAULT_BUDGET = 5000;
const toNumber = (s: string) => Number(s.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[^\d.]/g, "")) || 0;

export function RestockView({ rows }: { rows: StockRow[] | null }) {
  const { t, lang } = useLanguage();
  const r = t.restock;
  const [input, setInput] = useState(String(DEFAULT_BUDGET));
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const num = (n: number) => formatNumber(n, lang);
  const taka = (n: number) => formatTaka(n, lang);

  if (!rows) return <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 font-semibold text-danger">{t.stock.loadError}</p>;

  const byId = new Map(rows.map((p) => [p.id, p]));
  const name = (id: string) => { const p = byId.get(id)!; return (lang === "en" && p.name_en) || p.name_bn; };
  const plan = restock(rows, budget);
  const card = "rounded-[20px] border-2 border-success bg-white shadow-[0_8px_22px_rgba(15,23,42,0.07)]";

  return (
    <>
      <form className={`${card} flex flex-wrap items-end gap-5 p-6`} onSubmit={(e) => { e.preventDefault(); setBudget(toNumber(input)); }}>
        <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
          <span className="font-semibold">{r.budgetLabel}</span>
          <span className="flex h-14 items-center gap-2 rounded-[14px] border-[1.5px] border-success px-4">
            <span className="text-[22px] font-bold text-green-700">৳</span>
            <input aria-label={r.budget} inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)}
              className="w-full min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none" />
          </span>
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-success px-4.5 text-[15px] font-semibold text-white">{r.calculate}</button>
      </form>

      <section className={`${card} flex flex-col gap-2.5 px-6 py-5`}>
        <div className="flex flex-wrap justify-between gap-2">
          <strong>{r.usage}</strong>
          <span><strong className="text-green-700">{taka(plan.spent)}</strong> / {taka(budget)} · {r.left} {taka(plan.left)}</span>
        </div>
        <div className="h-3.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-success" style={{ width: `${budget > 0 ? Math.min(100, (plan.spent / budget) * 100) : 0}%` }} />
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="border-b-2 border-green-50 px-5 py-4"><strong className="text-lg">{r.listTitle}</strong></div>
        {plan.lines.length === 0 && plan.skipped.length === 0 && <p className="px-5 py-6 text-muted">{r.nothing}</p>}
        {plan.lines.map((l, i) => {
          const p = byId.get(l.id)!;
          const days = Math.floor(l.daysLeft);
          const reason = l.daysLeft === 0 ? r.outNow : days === 0 ? r.today : r.endsIn(num(days));
          return (
            <div key={l.id} className="grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-[52px_1fr_110px_110px]">
              <span className="flex size-10 items-center justify-center rounded-xl bg-green-50 font-bold text-green-700">{num(i + 1)}</span>
              <span className="flex flex-col">
                <strong className="text-[17px]">{name(l.id)}</strong>
                <span className={`text-sm ${days <= 2 ? "text-danger" : "text-amber-700"}`}>
                  {reason}{l.qty < l.need && ` · ${r.partial(`${num(l.qty)}/${num(l.need)}`)}`}
                </span>
              </span>
              <span className="whitespace-nowrap">{num(l.qty)} {t.units[p.unit] ?? p.unit}</span>
              <strong className="text-right text-[17px] whitespace-nowrap">{taka(l.cost)}</strong>
            </div>
          );
        })}
        {plan.skipped.length > 0 && (
          <p className="px-5 py-4 text-sm text-muted">{r.skipped} {plan.skipped.map(name).join(", ")}</p>
        )}
      </section>
      <p className="text-sm text-muted">{r.rule}</p>
    </>
  );
}
