"use client";
// লেনদেন (docs/mockup/Transactions.dc.html): today's totals, type + period filters, entries grouped by day.

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import type { TransactionsData } from "@/lib/db/queries";
import { groupByDay, TXN_FILTERS, TXN_PERIODS, type TxnFilter, type TxnPeriod } from "@/lib/logic/ledger";
import { dhakaDay } from "@/lib/logic/forecast";
import { formatNumber, formatTaka } from "@/lib/format";

const BADGE: Record<string, string> = {
  sale: "bg-green-100 text-green-700", purchase: "bg-blue-100 text-[#1D4ED8]",
  expense: "bg-amber-100 text-amber-700", payment: "bg-violet-50 text-accent", supplier: "bg-red-100 text-danger",
};
const pill = (on: boolean) =>
  `flex h-10 items-center rounded-full px-4.5 text-[15px] font-semibold ${on ? "border-[1.5px] border-primary bg-primary text-white" : "border-2 border-accent bg-white text-primary"}`;

function Total({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[20px] border-2 border-t-[6px] px-5.5 py-4.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] ${tone}`}>
      <span className="text-[15px] font-semibold text-slate-600">{title}</span>
      <span className="text-[32px] leading-tight font-bold">{value}</span>
      {sub && <span className="text-sm text-muted">{sub}</span>}
    </div>
  );
}

export function TransactionsView({ data, period, filter }: { data: TransactionsData | null; period: TxnPeriod; filter: TxnFilter }) {
  const { t, lang } = useLanguage();
  const x = t.transactions;
  const taka = (n: number) => formatTaka(n, lang);
  const locale = lang === "bn" ? "bn-BD" : "en-GB";
  const href = (type: TxnFilter, p: TxnPeriod) => `/transactions?type=${type}&p=${p}`;

  const filters = (
    <div className="flex flex-wrap justify-between gap-3">
      <div role="group" aria-label={x.filterLabel} className="flex flex-wrap gap-2">
        {TXN_FILTERS.map((f) => <Link key={f} href={href(f, period)} aria-current={f === filter ? "page" : undefined} className={pill(f === filter)}>{x.filters[f]}</Link>)}
      </div>
      <div role="group" aria-label={x.periodLabel} className="flex flex-wrap gap-2">
        {TXN_PERIODS.map((p) => <Link key={p} href={href(filter, p)} aria-current={p === period ? "page" : undefined} className={pill(p === period)}>{x.periods[p]}</Link>)}
      </div>
    </div>
  );
  if (!data) return <>{filters}<p role="alert" className="text-danger">{x.loadError}</p></>;

  const today = dhakaDay(new Date());
  const days = groupByDay(data.rows, filter);
  const items = (r: TransactionsData["rows"][number]) => r.items.map((i) =>
    i.unit === "pcs" ? `${i[lang]} × ${formatNumber(i.qty, lang)}` : `${i[lang]} ${formatNumber(i.qty, lang)} ${t.units[i.unit] ?? ""}`).join(", ");

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Total title={x.todaySales} value={taka(data.today.sales)} sub={x.count(formatNumber(data.today.count, lang))} tone="border-green-700 bg-green-50 text-green-700" />
        <Total title={x.todaySpend} value={taka(data.today.spend)} tone="border-amber-700 bg-amber-50 text-amber-700" />
        <Total title={x.todayCollected} value={taka(data.today.collected)} tone="border-accent bg-violet-50 text-accent" />
      </div>
      {filters}
      {days.length === 0 ? <p className="rounded-2xl border-2 border-border bg-white p-5 text-muted">{x.empty}</p> : days.map(({ day, items: rows }) => (
        <section key={day} className="overflow-hidden rounded-[20px] border-2 border-accent bg-white shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
          <div className="border-b-2 border-violet-50 px-5 py-3.5">
            <strong className="text-lg">
              {day === today && `${x.today} · `}
              {new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", timeZone: "UTC" })}
            </strong>
          </div>
          <ul>
            {rows.map((r) => {
              const supplierPay = r.type === "payment" && !!r.supplier_id;
              const title = r.type === "expense" ? (r.category || x.otherExpense) : [r.party, items(r)].filter(Boolean).join(" · ");
              return (
                <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3.5 gap-y-1 border-b border-slate-100 px-5 py-3.5 sm:grid-cols-[90px_100px_1fr_120px]">
                  <span className="text-sm text-muted">{new Date(r.occurred_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" })}</span>
                  <span className={`justify-self-end rounded-full px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap sm:justify-self-start ${BADGE[supplierPay ? "supplier" : r.type] ?? ""}`}>
                    {supplierPay ? x.supplierPaid : x.filters[r.type as TxnFilter] ?? r.type}
                  </span>
                  <span className="col-span-2 flex flex-col sm:col-span-1">
                    <strong>{title || "—"}</strong>
                    {r.raw && <span className="text-[13px] text-muted">“{r.raw}”</span>}
                  </span>
                  <span className="col-span-2 flex flex-col text-right sm:col-span-1">
                    <strong className="text-[17px]">{taka(r.total)}</strong>
                    {r.due > 0 && <span className="text-[13px] text-danger">{x.due(taka(r.due))}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="text-sm text-muted">{x.note}</p>
    </>
  );
}
