"use client";
// খরচ (docs/mockup/Expenses.dc.html): month totals, bars by category, this month's expense list.
// "+ খরচ যোগ করুন" opens the normal voice/text entry (an expense is recorded like any other transaction).

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import type { ExpensesData } from "@/lib/db/queries";
import { formatNumber, formatTaka } from "@/lib/format";

const BARS = ["bg-accent", "bg-[#1D4ED8]", "bg-[#F59E0B]", "bg-[#14B8A6]", "bg-slate-400"];
const COLS = "grid grid-cols-[120px_1fr_2fr_120px] gap-3 px-5";

function Total({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[20px] border-2 border-t-[6px] px-5.5 py-4.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] ${tone}`}>
      <span className="text-[15px] font-semibold text-slate-600">{title}</span>
      <span className="text-[32px] leading-tight font-bold">{value}</span>
      {sub && <span className="text-sm text-muted">{sub}</span>}
    </div>
  );
}

export function ExpensesView({ data }: { data: ExpensesData | null }) {
  const { t, lang } = useLanguage();
  const x = t.expenses;
  if (!data) return <p role="alert" className="text-danger">{x.loadError}</p>;
  const taka = (n: number) => formatTaka(n, lang);
  const locale = lang === "bn" ? "bn-BD" : "en-GB";
  const max = Math.max(1, ...data.byCategory.map((c) => c.total));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Total title={x.month} value={taka(data.month)} sub={x.monthSub} tone="border-slate-600 bg-slate-100 text-slate-600" />
        <Total title={x.lastMonth} value={taka(data.lastMonth)} tone="border-slate-600 bg-white text-slate-600" />
        <Total title={x.vsSales} value={data.salesPct === null ? "—" : `${formatNumber(data.salesPct, lang)}%`} tone="border-amber-700 bg-amber-50 text-amber-700" />
      </div>

      <section className="flex flex-col gap-4 rounded-[20px] border-2 border-slate-600 bg-white p-6 shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <strong className="text-lg">{x.byCategory}</strong>
          <Link href="/entry" className="flex h-11 items-center rounded-xl bg-primary px-4.5 text-[15px] font-semibold whitespace-nowrap text-white">{x.add}</Link>
        </div>
        {data.byCategory.length === 0 ? <p className="text-muted">{x.empty}</p> : data.byCategory.map((c, i) => (
          <div key={c.category || "other"} className="grid grid-cols-[110px_1fr_100px] items-center gap-3.5 sm:grid-cols-[130px_1fr_100px]">
            <span>{c.category || x.other}</span>
            <div className="h-3.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className={`h-full rounded-full ${BARS[i % BARS.length]}`} style={{ width: `${(c.total / max) * 100}%` }} />
            </div>
            <strong className="text-right">{taka(c.total)}</strong>
          </div>
        ))}
      </section>

      {data.list.length > 0 && (
        <div className="overflow-hidden rounded-[20px] border-2 border-slate-600 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className={`${COLS} border-b-2 border-slate-100 bg-bg py-3 text-sm font-bold text-slate-600`}>
                <span>{x.colDate}</span><span>{x.colCategory}</span><span>{x.colText}</span><span className="text-right">{x.colAmount}</span>
              </div>
              {data.list.map((e) => (
                <div key={e.id} className={`${COLS} items-center border-b border-slate-100 py-3.5`}>
                  <span>{new Date(e.at).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Dhaka" })}</span>
                  <span>{e.category || x.other}</span>
                  <span className="text-muted">{e.text ?? "—"}</span>
                  <span className="text-right">{taka(e.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
