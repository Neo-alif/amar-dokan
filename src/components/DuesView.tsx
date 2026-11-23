"use client";
// /dues screen (docs/mockup/Dues.dc.html): summary boxes, customers by due, ledger + জমা নিন.
// A payment goes through the same POST /api/transactions → apply_transaction path (DB blocks overpaying).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/i18n/LanguageContext";
import type { ErrorCode } from "@/i18n/dictionary";
import type { DuesData } from "@/lib/db/queries";
import { formatDateTime, formatNumber, formatTaka } from "@/lib/format";

export function DuesView({ data }: { data: DuesData | null }) {
  const { t, lang } = useLanguage();
  const d = t.dues;
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID()); // one idempotency key per payment attempt
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const num = (n: number) => formatNumber(n, lang);
  const taka = (n: number) => formatTaka(n, lang);

  if (!data) return <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 font-semibold text-danger">{d.loadError}</p>;
  const c = data.customers.find((x) => x.id === selected) ?? data.customers[0];

  function pick(id: string) {
    setSelected(id); setAmount(""); setError(null); setSaved(null); setKey(crypto.randomUUID());
  }

  async function pay(ev: React.FormEvent) {
    ev.preventDefault();
    const value = Number(amount.replace(/[০-৯]/g, (x) => String("০১২৩৪৫৬৭৮৯".indexOf(x))));
    if (!c || !(value > 0) || saving) return;
    setSaving(true); setError(null); setSaved(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: key, log_id: null, edited: false, type: "payment", customer_id: c.id, customer_name: c.name,
          items: [], paid: value, total: null, expense_category: null, raw_text: null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError((body.error as ErrorCode) ?? "SERVER_ERROR"); return; }
      setSaved(d.saved(taka(value), c.name));
      setAmount(""); setKey(crypto.randomUUID());
      router.refresh(); // reload the server numbers (due, ledger, summary)
    } catch {
      setError("NETWORK");
    } finally {
      setSaving(false);
    }
  }

  const box = (label: string, value: string, hint: string | null, tone: string) => (
    <div className={`flex flex-col gap-1 rounded-[20px] border-2 border-t-[6px] px-5 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)] ${tone}`}>
      <span className="text-[15px] font-semibold text-slate-600">{label}</span>
      <span className="text-2xl leading-tight font-bold sm:text-[30px]">{value}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {box(d.total, taka(data.totalDue), d.customersCount(num(data.customers.length)), "border-danger bg-red-50 text-danger")}
        {box(d.old, taka(data.oldTotal), d.people(num(data.oldCount)), "border-amber-700 bg-amber-50 text-amber-700")}
        {box(d.paidWeek, taka(data.paidThisWeek), null, "border-green-700 bg-green-50 text-green-700")}
      </div>

      {data.customers.length === 0 ? <p className="text-muted">{d.empty}</p> : (
        <div className="flex flex-wrap items-start gap-6">
          <section className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-[20px] border-2 border-danger bg-white shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
            <div className="flex items-center justify-between border-b-2 border-red-50 px-4.5 py-4">
              <strong className="text-lg">{d.listTitle}</strong>
              <span className="text-sm text-muted">{num(data.customers.length)} / {num(data.totalCustomers)}</span>
            </div>
            {data.customers.map((x) => (
              <button key={x.id} type="button" onClick={() => pick(x.id)} aria-pressed={x.id === c?.id}
                className={`flex w-full items-center gap-3.5 border-b border-l-[6px] border-b-slate-100 px-4.5 py-3.5 text-left ${x.id === c?.id ? "border-l-primary bg-orange-50" : "border-l-transparent hover:bg-bg"}`}>
                <span className="flex size-[42px] flex-none items-center justify-center rounded-full bg-slate-100 font-bold text-primary">{x.name.slice(0, 1)}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className={x.id === c?.id ? "text-primary" : undefined}>{x.name}</strong>
                  <span className="text-[13px] text-muted">{x.lastDays === null ? "" : x.lastDays === 0 ? d.lastToday : d.lastTx(num(x.lastDays))}</span>
                </span>
                <strong className={`text-lg ${x.oldestDays !== null && x.oldestDays > 7 ? "text-danger" : "text-amber-700"}`}>{taka(x.due)}</strong>
              </button>
            ))}
          </section>

          {c && (
            <section className="flex min-w-0 flex-[1_1_340px] flex-col gap-1.5 rounded-[20px] border-2 border-danger bg-white p-5.5 shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
              <span className="text-sm text-muted">{d.ledger}</span>
              <strong className="text-[22px] text-primary">{c.name}</strong>
              <span>{d.current} <strong className="text-danger">{taka(c.due)}</strong></span>
              <form onSubmit={pay} className="mt-3 flex flex-wrap gap-2.5">
                <input aria-label={d.amount(c.name)} placeholder={d.amount(c.name)} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border px-3.5" />
                <button type="submit" disabled={saving || !amount.trim()} className="min-h-11 rounded-xl bg-success px-4.5 text-[15px] font-semibold text-white disabled:opacity-50">
                  {saving ? d.saving : d.collect(c.name)}
                </button>
              </form>
              <div aria-live="polite" className="min-h-6">
                {error && <p className="font-semibold text-danger">{t.errors[error]}</p>}
                {saved && <p className="font-semibold text-success">{saved}</p>}
              </div>
              <strong className="mt-1 text-[15px] text-muted">{d.history}</strong>
              <div className="max-h-[480px] overflow-y-auto">
                {c.entries.map((e, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 border-b border-dashed border-border py-3 text-[15px]">
                    <strong>{e.change > 0 ? d.dueEntry : d.payEntry}</strong>
                    <strong className={`text-right ${e.change > 0 ? "text-danger" : "text-green-700"}`}>{e.change > 0 ? "+" : "−"}{taka(Math.abs(e.change))}</strong>
                    <span className="text-sm text-muted">{formatDateTime(e.at, lang)}{e.items.length
                      ? " · " + e.items.slice(0, 3).map((it) => `${it[lang]} ${num(it.qty)} ${t.units[it.unit] ?? it.unit}`).join(", ") + (e.items.length > 3 ? " …" : "")
                      : ""}</span>
                    <span className="text-right text-sm text-muted">{d.dueAfter} {taka(e.due)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
