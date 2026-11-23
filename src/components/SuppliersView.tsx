"use client";
// সাপ্লায়ার (opened from the দেনা card): name, what the shop still owes, last payment, and টাকা দিন per row.
// A payment goes through POST /api/transactions → apply_transaction (DB also blocks paying more than the due).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/i18n/LanguageContext";
import type { ErrorCode } from "@/i18n/dictionary";
import type { SuppliersData } from "@/lib/db/queries";
import { formatTaka } from "@/lib/format";
import { METHODS } from "@/lib/schema";

type Supplier = SuppliersData["suppliers"][number];

function PayForm({ s, onSaved }: { s: Supplier; onSaved: (msg: string | null) => void }) {
  const { t, lang } = useLanguage();
  const x = t.suppliers;
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [key, setKey] = useState(() => crypto.randomUUID()); // one idempotency key per payment attempt
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const taka = (n: number) => formatTaka(n, lang);
  const value = Number(amount.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))));
  const tooMuch = value > s.due;

  async function pay(ev: React.FormEvent) {
    ev.preventDefault();
    if (!(value > 0) || tooMuch || saving) return;
    setSaving(true); setError(null); onSaved(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotency_key: key, log_id: null, edited: false, type: "supplier_payment", method,
          customer_id: null, customer_name: null, supplier_id: s.id, supplier_name: s.name,
          items: [], paid: value, total: null, expense_category: null, raw_text: null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError((body.error as ErrorCode) ?? "SERVER_ERROR"); return; }
      onSaved(x.paidOk(s.name, taka(value)));
      setAmount(""); setKey(crypto.randomUUID());
      router.refresh(); // reload মোট দেনা, দেনা and শেষ পরিশোধ from the server
    } catch {
      setError("NETWORK");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="col-span-full flex flex-col gap-1">
      <form onSubmit={pay} className="flex flex-wrap gap-2">
        <input aria-label={x.payAmount} placeholder={x.payAmount} inputMode="decimal" value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(null); }} aria-invalid={tooMuch}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border px-3.5" />
        <select aria-label={x.method} value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
          className="h-11 rounded-xl border border-border bg-white px-3">
          {METHODS.map((m) => <option key={m} value={m}>{t.card.methods[m]}</option>)}
        </select>
        <button type="submit" disabled={saving || !(value > 0) || tooMuch}
          className="min-h-11 rounded-xl bg-danger px-4.5 text-[15px] font-semibold text-white disabled:opacity-50">
          {saving ? x.saving : x.pay}
        </button>
      </form>
      <div aria-live="polite" className="text-sm">
        {tooMuch && <p className="font-semibold text-danger">{x.overDue(taka(s.due))}</p>}
        {error && <p className="font-semibold text-danger">{t.errors[error]}</p>}
      </div>
    </div>
  );
}

export function SuppliersView({ data }: { data: SuppliersData | null }) {
  const { t, lang } = useLanguage();
  const x = t.suppliers;
  const [saved, setSaved] = useState<string | null>(null); // success line stays even if that supplier's due is now 0
  if (!data) return <p role="alert" className="text-danger">{x.loadError}</p>;
  const taka = (n: number) => formatTaka(n, lang);
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" });

  return (
    <>
      <div className="flex flex-col gap-1 rounded-[20px] border-2 border-t-[6px] border-[#FECACA] border-t-danger bg-white px-5.5 py-4.5 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
        <span className="text-[15px] font-semibold text-slate-600">{x.total}</span>
        <span className="text-[32px] leading-tight font-bold text-danger">{taka(data.total)}</span>
      </div>
      <p aria-live="polite" className="min-h-6 font-semibold text-success">{saved}</p>
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
                {s.due > 0 && <PayForm s={s} onSaved={setSaved} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-muted">{x.hint}</p>
    </>
  );
}
