"use client";
// Printable monthly audit (docs/mockup/Report.dc.html). PDF = browser "Save as PDF" via window.print(); no PDF library.

import { useEffect, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { InsightError, useInsight } from "@/components/insightCards";
import { useLanguage } from "@/i18n/LanguageContext";
import { formatTaka, modelName } from "@/lib/format";

export default function ReportPage() {
  const { t, lang } = useLanguage();
  const r = t.report, s = t.insight;
  const { data, error, loading, retry } = useInsight();
  const printed = useRef(false);
  const taka = (n: number) => formatTaka(Math.round(n), lang);
  const locale = lang === "bn" ? "bn-BD" : "en-GB";

  // Home "PDF ডাউনলোড" opens /report?print=1 → print once the AI text has arrived
  useEffect(() => {
    if (data && !printed.current && new URLSearchParams(window.location.search).has("print")) {
      printed.current = true;
      window.print();
    }
  }, [data]);

  const n = data?.numbers;
  const name = (id: string) => n?.names[id]?.[lang] ?? "";
  const box = (label: string, value: number, tone: string) => (
    <div className={`flex flex-col rounded-[14px] border-2 bg-white px-4 py-3.5 ${tone}`}>
      <span className="text-[13px] text-muted">{label}</span>
      <strong className="text-xl sm:text-2xl">{taka(value)}</strong>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="report" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-18 sm:px-8 print:p-0">
        <div className="flex justify-end gap-2.5 print:hidden">
          <button type="button" onClick={() => window.print()} disabled={!data} className="min-h-11 rounded-xl bg-primary px-4.5 text-[15px] font-semibold text-white disabled:opacity-50">{s.pdf}</button>
          <button type="button" onClick={() => window.print()} disabled={!data} className="min-h-11 rounded-xl border-2 border-teal-700 bg-white px-4.5 text-[15px] font-semibold text-primary disabled:opacity-50">{r.print}</button>
        </div>

        {loading && <p className="text-center text-muted animate-pulse" aria-live="polite">{s.writing}</p>}
        {error && <InsightError error={error} retry={retry} center />}

        {data && n && (
          <article className="mx-auto flex w-full max-w-[820px] flex-col gap-5.5 rounded-lg border-2 border-teal-700 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:px-14 sm:py-12 print:border-0 print:shadow-none">
            <div className="flex items-start justify-between gap-4 border-b-[3px] border-[#FBBF24] pb-4">
              <div>
                <strong className="text-2xl text-primary sm:text-[28px]">{r.title}</strong>
                <div className="text-muted">
                  {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(n.month.monthStart))} · {n.shopName}
                </div>
              </div>
              <span className="text-xl font-bold whitespace-nowrap text-primary">{lang === "bn" ? <>আমার <span className="text-[#F59E0B]">দোকান</span></> : <>Amar <span className="text-[#F59E0B]">Dokan</span></>}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {box(r.sales, n.month.sales, "border-text text-text")}
              {box(r.profit, n.month.profit, "border-green-700 text-green-700")}
              {box(r.spend, n.month.spend, "border-amber-700 text-amber-700")}
              {box(r.totalDue, n.totalDue, "border-danger text-danger")}
            </div>

            <section className="flex flex-col gap-2">
              <strong className="text-lg text-primary">{r.keyPoints}</strong>
              <p className="rounded-xl bg-violet-50 p-3"><strong>{s.todayLabel}:</strong> {data.today}</p>
              <ul className="flex list-disc flex-col gap-1.5 pl-5">{data.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </section>

            <section className="flex flex-col gap-2">
              <strong className="text-lg text-primary">{r.top5}</strong>
              <table className="w-full text-left">
                <thead className="border-b-2 border-border text-sm text-muted"><tr><th className="py-2">{r.product}</th><th className="py-2 text-right">{r.sales}</th><th className="py-2 text-right">{r.profit}</th></tr></thead>
                <tbody>
                  {n.month.top5.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100"><td className="py-2">{name(p.id)}</td><td className="py-2 text-right">{taka(p.sales)}</td><td className="py-2 text-right text-green-700">{taka(p.profit)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-lg text-primary">{r.nextMonth}</strong>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-accent">{s.aiBy(modelName(data.model))}</span>
              </div>
              <ul className="flex list-disc flex-col gap-1.5 pl-5">{data.next.map((b, i) => <li key={i}>{b.tip} <span className="text-[13px] text-muted">({s.why}: {b.why})</span></li>)}</ul>
            </section>

            <p className="text-[13px] text-muted">
              {r.footer(new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Asia/Dhaka" }).format(new Date()))}
            </p>
          </article>
        )}
      </main>
    </div>
  );
}
