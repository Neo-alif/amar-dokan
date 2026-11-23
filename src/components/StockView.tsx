"use client";
// /stock screen (docs/mockup/Stock.dc.html): summary boxes, filter chips, table with days left + status.

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import type { StockRow } from "@/lib/db/queries";
import type { StockStatus } from "@/lib/logic/forecast";
import { formatNumber, formatTaka } from "@/lib/format";

const CHIP: Record<StockStatus, string> = {
  ok: "bg-green-100 text-green-700",
  low: "bg-amber-100 text-amber-700",
  out: "bg-danger text-white",
};

function Box({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[20px] border-2 border-t-[6px] px-5 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)] ${tone}`}>
      <span className="text-[15px] font-semibold text-slate-600">{label}</span>
      <span className="text-2xl leading-tight font-bold sm:text-[30px]">{value}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

export function StockView({ rows }: { rows: StockRow[] | null }) {
  const { t, lang } = useLanguage();
  const s = t.stock;
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const num = (n: number) => formatNumber(n, lang);
  const unit = (u: string) => t.units[u] ?? u;
  const name = (r: StockRow) => (lang === "en" && r.name_en) || r.name_bn;

  if (!rows) return <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 font-semibold text-danger">{s.loadError}</p>;
  if (rows.length === 0) return <p className="text-muted">{s.empty}</p>;

  const order: Record<StockStatus, number> = { out: 0, low: 1, ok: 2 };
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status] || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  const shown = sorted.filter((r) => filter === "all" || r.status === filter);
  const count = (st: StockStatus) => rows.filter((r) => r.status === st).length;
  const value = rows.reduce((sum, r) => sum + Math.max(0, r.stock) * r.cost_price, 0);
  const weekdays = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { weekday: "short", timeZone: "Asia/Dhaka" });

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Box label={s.totalProducts} value={`${num(rows.length)}${t.home.productsUnit}`} tone="border-blue-700 bg-blue-50 text-blue-700" />
        <Box label={s.low} value={`${num(count("low"))}${t.home.productsUnit}`} hint={s.lowHint} tone="border-amber-700 bg-amber-50 text-amber-700" />
        <Box label={s.out} value={`${num(count("out"))}${t.home.productsUnit}`} tone="border-danger bg-red-50 text-danger" />
        <Box label={s.value} value={formatTaka(Math.round(value), lang)} hint={s.valueHint} tone="border-green-700 bg-green-50 text-green-700" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group">
          {(["all", "low", "out"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={`min-h-11 rounded-full border-2 px-4.5 text-[15px] font-semibold ${filter === f ? "border-primary bg-primary text-white" : "border-blue-700 bg-white text-primary"}`}>
              {f === "all" ? s.filterAll : f === "low" ? s.low : s.out}
            </button>
          ))}
        </div>
        <Link href="/entry" className="flex min-h-11 items-center rounded-xl bg-primary px-4.5 text-[15px] font-semibold text-white">{s.addStock}</Link>
      </div>

      <div className="overflow-hidden rounded-[20px] border-2 border-blue-700 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-base">
            <thead className="border-b-2 border-blue-50 bg-bg text-sm font-bold text-slate-600">
              <tr>{[s.colProduct, s.colStock, s.colAvg, s.colDays, s.colStatus].map((h) => <th key={h} className="px-5 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const open = openId === r.id;
                const daysColor = r.daysLeft !== null && r.daysLeft <= 2 ? "text-danger" : r.status !== "ok" ? "text-amber-700" : "";
                return [
                  <tr key={r.id} className="cursor-pointer border-b border-slate-100 hover:bg-bg" onClick={() => setOpenId(open ? null : r.id)}>
                    <td className="px-5 py-3.5">
                      <button type="button" aria-expanded={open} className="text-left font-semibold text-primary">{name(r)}</button>
                    </td>
                    <td className="px-5 py-3.5">{num(r.stock)} {unit(r.unit)}</td>
                    <td className="px-5 py-3.5">{r.avg === null ? <span className="text-muted">{s.learning}</span> : `${num(r.avg)} ${unit(r.unit)}`}</td>
                    <td className={`px-5 py-3.5 font-semibold ${daysColor}`}>
                      {r.daysLeft !== null ? s.days(num(Math.floor(r.daysLeft))) : r.avg === null ? "—" : s.noSales}
                    </td>
                    <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap ${CHIP[r.status]}`}>{s.status[r.status]}</span></td>
                  </tr>,
                  open && (
                    <tr key={`${r.id}-f`} className="border-b border-slate-100 bg-bg">
                      <td colSpan={5} className="px-5 py-4">
                        {r.forecast ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-sm font-semibold text-slate-600">{s.next7}</span>
                            <div className="grid grid-cols-7 gap-2 text-center text-sm">
                              {r.forecast.map((q, i) => (
                                <div key={i} className="rounded-xl border border-border bg-white px-1 py-2">
                                  <div className="text-muted">{weekdays.format(new Date(Date.now() + i * 864e5))}</div>
                                  <div className="font-semibold">{num(Math.round(q * 10) / 10)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : <span className="text-sm text-muted">{s.learningHint}</span>}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-sm text-muted">{s.note}</p>
    </>
  );
}
