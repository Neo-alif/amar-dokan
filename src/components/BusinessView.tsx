"use client";
// ব্যবসার অবস্থা (docs/mockup/Business.dc.html). Every number comes from the server (logic/business.ts);
// the AI advice is the existing /api/insight tips, each with its কেন line.

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import type { BusinessData } from "@/lib/db/queries";
import { PERIODS, type Period } from "@/lib/logic/business";
import { formatNumber, formatTaka, modelName } from "@/lib/format";
import { InsightError, useInsight } from "@/components/insightCards";
import { BarList, DailySalesChart } from "@/components/BusinessCharts";

const TONE = {
  green: ["border-[#BBF7D0] border-t-[#16A34A]", "text-[#16A34A]"],
  orange: ["border-[#FED7AA] border-t-[#EA580C]", "text-[#EA580C]"],
  red: ["border-[#FECACA] border-t-[#DC2626]", "text-[#DC2626]"],
  blue: ["border-[#BFDBFE] border-t-[#1D4ED8]", "text-[#1D4ED8]"],
  ink: ["border-border border-t-[#0F172A]", "text-[#0F172A]"],
  slate: ["border-border border-t-[#475569]", "text-[#475569]"],
  amber: ["border-[#FDE68A] border-t-[#B45309]", "text-[#B45309]"],
  violet: ["border-[#DDD6FE] border-t-[#6D28D9]", "text-[#6D28D9]"],
} as const;

function Stat({ tone, title, value, sub, formula }: { tone: keyof typeof TONE; title: string; value: string; sub?: string; formula?: string }) {
  const [box, text] = TONE[tone];
  return (
    <div className={`flex flex-col gap-1 rounded-[18px] border-2 border-t-[6px] bg-white px-4.5 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)] ${box}`}>
      <span className="text-[15px] font-semibold text-slate-600">{title}</span>
      <span className={`text-[26px] leading-tight font-bold ${text}`}>{value}</span>
      {sub && <span className="text-[13.5px] text-muted">{sub}</span>}
      {formula && <span className="border-t border-dashed border-border pt-1.5 text-[12.5px] text-muted">{formula}</span>}
    </div>
  );
}

function Section({ icon, bg, title, sub }: { icon: React.ReactNode; bg: string; title: string; sub: string }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className={`flex size-11 flex-none items-center justify-center rounded-[14px] ${bg}`}>{icon}</span>
      <div><h2 className="text-2xl font-bold text-primary">{title}</h2><span className="text-sm text-muted">{sub}</span></div>
    </div>
  );
}
const icon = (stroke: string, d: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

function Advice() {
  const { t } = useLanguage();
  const b = t.business, s = t.insight;
  const { data, error, loading, retry } = useInsight();
  return (
    <>
      <Section bg="bg-violet-50" title={b.aiTitle} sub={b.aiSub} icon={icon("#6D28D9", <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />)} />
      {loading && <p className="animate-pulse text-muted" aria-live="polite">{s.writing}</p>}
      {error && <InsightError error={error} retry={retry} />}
      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {data.next.map((x, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-[14px] border-2 border-border bg-white px-4 py-3.5">
                <span className="text-[15.5px] leading-relaxed">{x.tip}</span>
                <span className="text-[13px] text-muted">{s.why}: {x.why}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-accent">{s.aiBy(modelName(data.model))}</span>
            <span>{`${s.verified} · ${b.aiNote}`}</span>
          </div>
        </>
      )}
    </>
  );
}

export function BusinessView({ data, period }: { data: BusinessData | null; period: Period }) {
  const { t, lang } = useLanguage();
  const b = t.business;
  const taka = (n: number) => formatTaka(Math.round(n), lang);
  const num = (n: number) => formatNumber(n, lang);
  const locale = lang === "bn" ? "bn-BD" : "en-GB";
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });

  const filter = (
    <div className="flex gap-2" role="group" aria-label={b.title}>
      {PERIODS.map((p) => (
        <Link key={p} href={`/business?p=${p}`} aria-current={p === period ? "page" : undefined}
          className={`flex h-10 items-center rounded-full border-2 px-4.5 text-[15px] font-semibold ${p === period ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-primary"}`}>
          {b.periods[p]}
        </Link>
      ))}
    </div>
  );
  if (!data) return <>{filter}<p role="alert" className="text-danger">{b.loadError}</p></>;

  const { position: pos, pl } = data;
  const time = new Date(data.updatedAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });
  const change = (v: number | null) => (v === null ? b.noCompare : b.change(num(Math.abs(v)), v >= 0));
  const empty = <p className="text-muted">{b.noData}</p>;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {filter}
        <span className="text-sm text-muted">{b.updated(`${day(data.from)} – ${day(data.to)}`, time)}</span>
      </div>

      <Section bg="bg-green-100" title={b.posTitle} sub={b.posSub}
        icon={icon("#16A34A", <><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></>)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="green" title={b.available} value={taka(pos.available)} sub={b.availableSub(taka(data.cash), taka(data.bankTotal))} formula={b.availableF} />
        <Stat tone="orange" title={b.receivable} value={taka(pos.receivable)} sub={b.receivableSub(num(data.customers), num(data.oldCustomers))} formula={b.receivableF} />
        <Stat tone="red" title={b.payable} value={taka(pos.payable)} sub={b.payableSub(num(data.suppliers))} formula={b.payableF} />
        <Stat tone="blue" title={b.inventory} value={taka(pos.inventory)} sub={b.inventorySub(num(data.products), num(data.low), num(data.out))} formula={b.inventoryF} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-primary px-6 py-4.5">
        <div className="flex flex-col"><span className="text-slate-300">{b.netWorth}</span><span className="text-[13.5px] text-slate-400">{b.netWorthF}</span></div>
        <span className="text-[34px] font-bold text-[#FBBF24]">{taka(pos.netWorth)}</span>
      </div>

      <Section bg="bg-violet-100" title={b.plTitle} sub={b.plSub}
        icon={icon("#6D28D9", <><path d="M12 2v20" /><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat tone="ink" title={b.revenue} value={taka(pl.revenue)} sub={change(data.salesChangePct)} />
        <Stat tone="slate" title={b.cogs} value={taka(pl.cogs)} sub={b.cogsF} />
        <Stat tone="green" title={b.gross} value={taka(pl.gross)} sub={b.grossF} />
        <Stat tone="amber" title={b.expenses} value={taka(pl.expenses)} sub={b.expensesF} />
        <Stat tone="violet" title={b.net} value={taka(pl.net)} sub={b.netF} />
        <Stat tone="violet" title={b.margin} value={pl.marginPct === null ? "—" : `${num(pl.marginPct)}%`} sub={b.marginF}
          formula={data.marginChange === null ? undefined : change(data.marginChange)} />
      </div>
      <span className="text-[13px] text-muted">{b.rules}</span>

      <Section bg="bg-blue-100" title={b.chartsTitle} sub={b.chartsSub} icon={icon("#1D4ED8", <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>)} />
      <div className="rounded-[20px] border-2 border-border bg-white p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
        <strong className="text-[17px]">{b.daily}</strong>
        {pl.revenue > 0 ? <DailySalesChart data={data.daily} taka={taka} day={day} label={b.daily} /> : empty}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[20px] border-2 border-border bg-white p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
          <strong className="text-[17px]">{b.expenseChart}</strong>
          {data.expenses.length ? <BarList color="#B45309" taka={taka} label={b.expenseChart}
            data={data.expenses.map((e) => ({ name: e.category || b.other, value: e.total }))} /> : empty}
        </div>
        <div className="flex flex-col gap-3 rounded-[20px] border-2 border-border bg-white p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
          <strong className="text-[17px]">{b.top5}</strong>
          {data.top5.length ? <BarList color="#1D4ED8" taka={taka} label={b.top5}
            data={data.top5.map((p) => ({ name: p[lang] ?? "", value: p.sales }))} /> : empty}
        </div>
      </div>

      <Advice />
    </>
  );
}
