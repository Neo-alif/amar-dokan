"use client";

// "চাল ৪০ কেজি আছে" → owner confirms the counted qty; the DB sets stock to it (apply_stock_count).
// The before → after preview is display only; the change is recomputed in the DB at save time.
import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import type { ErrorCode } from "@/i18n/dictionary";
import { formatNumber } from "@/lib/format";
import { DaysAgo } from "@/components/ConfirmCard";

export type StockCountDraft = {
  type: "stock_count"; days_ago: number; product: string; product_id: string | null; unit: string | null;
  counted: number | null; stock_before: number | null; ask_count: "bottle" | "packet" | null;
};

export function StockCountCard({ draft, entry, log_id, onDone }: {
  draft: StockCountDraft; entry: { batch_key: string; index: number }; log_id: string | null; onDone: (saved: boolean) => void;
}) {
  const { t, lang } = useLanguage();
  const c = t.card;
  const [counted, setCounted] = useState<number | null>(draft.counted);
  const [daysAgo, setDaysAgo] = useState(draft.days_ago);
  const [editing, setEditing] = useState(draft.counted == null || !draft.product_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const unit = draft.unit ? (t.units[draft.unit] ?? draft.unit) : "";
  const askUnit = draft.ask_count ? t.units[draft.ask_count] : unit; // "৫ লিটার" of 2 L bottles → ask in বোতল
  const problems: ErrorCode[] = [...(!draft.product_id ? ["NEED_PRODUCT" as const] : []), ...(counted == null || counted < 0 ? ["NEED_COUNT" as const] : [])];
  const n = (v: number) => formatNumber(v, lang);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/stock-count", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...entry, log_id, product_id: draft.product_id, counted, days_ago: daysAgo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError((body.error as ErrorCode) ?? "SERVER_ERROR"); return; }
      onDone(true);
    } catch {
      setError("NETWORK");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-teal-100 px-3.5 py-1 text-[15px] font-bold text-teal-800">{c.stockCount}</span>
        <DaysAgo value={daysAgo} editing={editing} onChange={setDaysAgo} />
        <span className="text-[13px] text-muted">{c.aiNote}</span>
      </div>
      <dl className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-3 text-[17px]">
        <dt className="text-muted">{c.product}</dt>
        <dd className="font-semibold">{draft.product || "—"}</dd>
        <dt className="text-muted">{draft.ask_count && counted == null ? c.askCount(askUnit) : c.counted}</dt>
        <dd className="font-semibold">
          {editing ? (
            <span className="flex items-center gap-2">
              <input aria-label={c.counted} type="number" inputMode="decimal" min="0" value={counted ?? ""}
                onChange={(e) => setCounted(e.target.value.trim() === "" || Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value))}
                className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-base" />
              <span className="text-muted">{draft.unit ? unit : ""}</span>
            </span>
          ) : <>{counted == null ? "—" : n(counted)} {unit}</>}
        </dd>
        {draft.stock_before != null && (
          <><dt className="text-muted">{c.inBooks}</dt><dd className="font-semibold">{n(draft.stock_before)} {unit}</dd></>
        )}
      </dl>
      {problems.length === 0 && draft.stock_before != null && counted != null ? (
        <p className="rounded-2xl bg-bg px-4 py-3 text-[15px]">
          {c.stockAfter}: {n(draft.stock_before)} → <b>{n(counted)}</b> {unit} ({counted - draft.stock_before >= 0 ? "+" : "−"}{n(Math.abs(Math.round((counted - draft.stock_before) * 100) / 100))})
        </p>
      ) : (
        <ul className="list-inside list-disc text-[15px] font-semibold text-danger" aria-live="polite">
          {problems.map((p) => <li key={p}>{t.errors[p]}</li>)}
        </ul>
      )}
      {error && <p role="alert" className="font-semibold text-danger">{t.errors[error]}</p>}
      <button type="button" disabled={problems.length > 0 || saving} onClick={save}
        className="h-[54px] rounded-[14px] bg-success text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? c.saving : c.confirm}
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setEditing(!editing)} className="h-12 rounded-xl border border-border bg-white font-semibold text-primary">{editing ? c.doneEdit : c.edit}</button>
        <button type="button" onClick={() => onDone(false)} disabled={saving} className="h-12 rounded-xl border border-red-200 bg-white font-semibold text-danger">{c.cancel}</button>
      </div>
    </div>
  );
}
