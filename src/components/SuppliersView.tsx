"use client";
// সাপ্লায়ার (opened from the দেনা card): name, what the shop still owes, last payment. Read-only;
// payments are recorded through the normal entry ("রহমান ট্রেডার্সকে ২০০০ টাকা দিলাম").

import { useLanguage } from "@/i18n/LanguageContext";
import type { SuppliersData } from "@/lib/db/queries";
import { formatTaka } from "@/lib/format";

export function SuppliersView({ data }: { data: SuppliersData | null }) {
  const { t, lang } = useLanguage();
  const x = t.suppliers;
  if (!data) return <p role="alert" className="text-danger">{x.loadError}</p>;
  const taka = (n: number) => formatTaka(n, lang);
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" });

  return (
    <>
      <div className="flex flex-col gap-1 rounded-[20px] border-2 border-t-[6px] border-[#FECACA] border-t-danger bg-white px-5.5 py-4.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
        <span className="text-[15px] font-semibold text-slate-600">{x.total}</span>
        <span className="text-[32px] leading-tight font-bold text-danger">{taka(data.total)}</span>
      </div>
      {data.suppliers.length === 0 ? <p className="rounded-2xl border-2 border-border bg-white p-5 text-muted">{x.empty}</p> : (
        <div className="overflow-hidden rounded-[20px] border-2 border-border bg-white shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
          <div className="grid grid-cols-[1.4fr_1fr_1.4fr] gap-3 border-b-2 border-slate-100 bg-bg px-5 py-3 text-sm font-bold text-slate-600">
            <span>{x.colName}</span><span className="text-right">{x.colDue}</span><span className="text-right">{x.colLast}</span>
          </div>
          <ul>
            {data.suppliers.map((s) => (
              <li key={s.id} className="grid grid-cols-[1.4fr_1fr_1.4fr] items-center gap-3 border-b border-slate-100 px-5 py-3.5">
                <strong>{s.name}</strong>
                <strong className={`text-right ${s.due > 0 ? "text-danger" : "text-muted"}`}>{taka(s.due)}</strong>
                <span className="text-right text-sm text-muted">{s.lastPayment ? x.lastPaid(taka(s.lastPayment.amount), date(s.lastPayment.at)) : x.never}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-muted">{x.hint}</p>
    </>
  );
}
