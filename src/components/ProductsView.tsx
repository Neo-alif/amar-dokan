"use client";
// পণ্য (docs/mockup/Products.dc.html): search, sort, price/margin/stock/week table, and a detail panel with the
// 7-day forecast for the tapped product. All numbers come from the server; search and sort happen here.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/i18n/LanguageContext";
import type { ErrorCode } from "@/i18n/dictionary";
import { UNITS } from "@/lib/schema";
import type { ProductRow } from "@/lib/db/queries";
import { marginPct, PRODUCT_SORTS, sortProducts, type ProductSort } from "@/lib/logic/products";
import { addDays, dhakaDay } from "@/lib/logic/forecast";
import { formatNumber, formatTaka } from "@/lib/format";

const COLS = "grid grid-cols-[2fr_1fr_1fr_90px_1fr_1.2fr] gap-3 px-5";

export function ProductsView({ rows }: { rows: ProductRow[] | null }) {
  const { t, lang } = useLanguage();
  const x = t.products;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ProductSort>("best");
  const [picked, setPicked] = useState<string | null>(null);
  if (!rows) return <p role="alert" className="text-danger">{x.loadError}</p>;

  const locale = lang === "bn" ? "bn-BD" : "en-GB";
  const num = (n: number) => formatNumber(n, lang);
  const qty = (n: number, unit: string) => `${num(n)} ${t.units[unit] ?? ""}`;
  const named = rows.map((p) => ({ ...p, name: (lang === "bn" ? p.name_bn : p.name_en ?? p.name_bn) }));
  const needle = q.trim().toLowerCase();
  const shown = sortProducts(named.filter((p) => !needle || [p.name_bn, p.name_en ?? "", ...p.aliases].some((n) => n.toLowerCase().includes(needle))), sort, locale);
  const sel = named.find((p) => p.id === (picked ?? shown[0]?.id));
  const today = dhakaDay(new Date());
  const maxF = Math.max(1, ...(sel?.forecast ?? []));

  return (
    <>
      <NewProduct />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-[46px] flex-[1_1_320px] items-center gap-2 rounded-xl border-2 border-amber-700 bg-white px-3.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={x.search} aria-label={x.searchLabel} className="flex-1 text-[15px] outline-none" />
        </label>
        <div role="group" aria-label={x.sortLabel} className="flex flex-wrap gap-2">
          {PRODUCT_SORTS.map((s) => (
            <button key={s} type="button" aria-pressed={s === sort} onClick={() => setSort(s)}
              className={`h-10 rounded-full px-4.5 text-[15px] font-semibold ${s === sort ? "border-[1.5px] border-primary bg-primary text-white" : "border-2 border-amber-700 bg-white text-primary"}`}>
              {x.sorts[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[20px] border-2 border-amber-700 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={`${COLS} border-b-2 border-amber-50 bg-bg py-3 text-sm font-bold text-slate-600`}>
              <span>{x.colProduct}</span><span>{x.colSell}</span><span>{x.colCost}</span><span>{x.colMargin}</span><span>{x.colStock}</span><span>{x.colWeek}</span>
            </div>
            {shown.length === 0 && <p className="px-5 py-4 text-muted">{x.none}</p>}
            {shown.map((p) => {
              const m = marginPct(p.sell_price, p.cost_price);
              return (
                <button key={p.id} type="button" onClick={() => setPicked(p.id)} aria-pressed={p.id === sel?.id}
                  className={`${COLS} w-full items-center border-b border-slate-100 py-3.5 text-left ${p.id === sel?.id ? "bg-amber-50" : "hover:bg-bg"}`}>
                  <span>{p.name}</span>
                  <span>{formatTaka(p.sell_price, lang)}</span>
                  <span>{formatTaka(p.cost_price, lang)}</span>
                  <span className={`font-bold ${m !== null && m < 0 ? "text-danger" : "text-green-700"}`}>{m === null ? "—" : `${num(m)}%`}</span>
                  <span className={p.status === "ok" ? "" : "font-semibold text-danger"}>{qty(p.stock, p.unit)}</span>
                  <span>{qty(p.weekQty, p.unit)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {sel && (
        <section className="flex flex-wrap gap-6 rounded-[20px] border-2 border-amber-700 bg-white p-6 shadow-[0_8px_22px_rgba(15,23,42,0.07)]" aria-live="polite">
          <div className="flex flex-[1_1_260px] flex-col gap-1.5">
            <span className="text-sm text-muted">{x.detail}</span>
            <strong className="text-2xl text-primary">{sel.name}</strong>
            <span className="text-[15px]">
              {t.stock.colStock} {qty(sel.stock, sel.unit)}
              {sel.daysLeft !== null && <> · <strong className={sel.status === "ok" ? "text-green-700" : "text-danger"}>{x.lasts(num(Math.floor(sel.daysLeft)))}</strong></>}
            </span>
            {sel.aliases.length > 0 && <span className="text-sm text-muted">{x.names}: {[sel.name_bn, ...sel.aliases].join(", ")}</span>}
          </div>
          <div className="flex flex-[2_1_420px] flex-col gap-2">
            <span className="text-sm font-semibold text-slate-600">{t.stock.next7}</span>
            {sel.forecast ? (
              <div className="flex h-[120px] items-end gap-2.5">
                {sel.forecast.map((v, i) => {
                  const day = addDays(today, i);
                  return (
                    <div key={day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-xs text-muted">{num(Math.round(v))}</span>
                      <div className={`w-full rounded-lg ${v === Math.max(...sel.forecast!) ? "bg-[#F59E0B]" : "bg-blue-300"}`} style={{ height: `${Math.max(4, (v / maxF) * 72)}px` }} />
                      <span className="text-[13px] text-muted">{new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" })}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted">{t.stock.learningHint}</p>}
          </div>
        </section>
      )}
    </>
  );
}

// "+ নতুন পণ্য": the owner adds a product by hand (e.g. loose oil in litres). Saved via POST /api/products;
// stock starts at 0 and moves only through purchases and stock counts.
function NewProduct() {
  const { t } = useLanguage();
  const x = t.products;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>("pcs");
  const [sell, setSell] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const money = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))));
  const valid = name.trim() !== "" && money(sell) >= 0 && money(cost) >= 0;
  const field = "min-h-11 w-full rounded-xl border border-border bg-white px-3 text-base";

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name_bn: name.trim(), unit, sell_price: money(sell), cost_price: money(cost),
          aliases: aliases.split(/[,،]/).map((a) => a.trim()).filter(Boolean),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError((body.error as ErrorCode) ?? "SERVER_ERROR"); return; }
      setSaved(x.saved(name.trim()));
      setName(""); setAliases(""); setUnit("pcs"); setSell(""); setCost(""); setOpen(false);
      router.refresh(); // the new product shows up in the table
    } catch {
      setError("NETWORK");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { setOpen(true); setSaved(null); }}
          className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-white">{x.add}</button>
        {saved && <span role="status" className="font-semibold text-green-700">{saved}</span>}
      </div>
    );
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-[20px] border-2 border-amber-700 bg-white p-6 shadow-[0_8px_22px_rgba(15,23,42,0.07)]">
      <strong className="text-xl text-primary">{x.addTitle}</strong>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[15px]">{x.name}
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={x.namePlaceholder} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[15px]">{x.aliases}
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder={x.aliasesPlaceholder} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[15px]">{x.unit}
          <select value={unit} onChange={(e) => setUnit(e.target.value as (typeof UNITS)[number])} className={field}>
            {UNITS.map((u) => <option key={u} value={u}>{t.units[u]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[15px]">{x.colSell}
            <input type="number" inputMode="decimal" min="0" step="any" value={sell} onChange={(e) => setSell(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[15px]">{x.colCost}
            <input type="number" inputMode="decimal" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} className={field} />
          </label>
        </div>
      </div>
      <p className="text-sm text-muted">{x.stockNote}</p>
      {error && <p role="alert" className="text-danger">{t.errors[error]}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!valid || saving} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-50">{x.save}</button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className="min-h-11 rounded-xl border-2 border-amber-700 bg-white px-5 font-semibold text-primary">{x.cancel}</button>
      </div>
    </form>
  );
}
