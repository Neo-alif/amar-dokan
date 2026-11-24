"use client";

import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import type { ErrorCode } from "@/i18n/dictionary";
import { answerPaid, answerUnit, unitMismatch, cardChange, cardProblems, cardTotals, isAmountType, type Card, type CardType, type Method } from "@/lib/logic/card";
import { numbersIn } from "@/lib/logic/numberCheck";
import { formatNumber, formatTaka } from "@/lib/format";
import { MicButton } from "@/components/MicButton";

// entry: one card of a multi-event message → saved with batch_key + index (server derives the idempotency key)
export type CardMeta = { log_id: string | null; raw_text: string | null; manual: boolean; clarify_question: string | null; entry?: { batch_key: string; index: number } };

const BADGE: Record<CardType, string> = {
  sale: "bg-green-100 text-green-700",
  purchase: "bg-blue-100 text-blue-700",
  expense: "bg-amber-100 text-amber-800",
  payment: "bg-purple-100 text-purple-700",
  supplier_payment: "bg-rose-100 text-rose-700",
  unknown: "bg-slate-100 text-slate-600",
};
const TYPES: CardType[] = ["sale", "purchase", "expense", "payment", "supplier_payment"];
const METHOD_LIST: Method[] = ["cash", "bkash", "bank"];
const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const input = "w-full min-h-11 rounded-xl border border-border bg-white px-3 text-base";

export function ConfirmCard({ initial, meta, onDone }: { initial: Card; meta: CardMeta; onDone: (saved: boolean) => void }) {
  const { t, lang } = useLanguage();
  const c = t.card;
  const [card, setCard] = useState(initial);
  const [editing, setEditing] = useState(meta.manual || cardProblems(initial).length > 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID()); // one key per card: double-taps save once

  const { total, paid, due } = cardTotals(card);
  const problems = cardProblems(card);
  const saleChange = cardChange(card);
  const [change, setChange] = useState<number | null>(null); // ফেরত: cash handed back, shown only (not saved)
  const taka = (n: number | null) => (n == null ? "—" : formatTaka(n, lang));
  const set = (patch: Partial<Card>) => setCard((prev) => ({ ...prev, ...patch }));
  const setItem = (i: number, patch: Partial<Card["items"][number]>) =>
    set({ items: card.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const isItems = card.type === "sale" || card.type === "purchase";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(meta.entry ?? { idempotency_key: idempotencyKey }),
          days_ago: card.days_ago ?? 0,
          log_id: meta.log_id,
          edited: JSON.stringify(card) !== JSON.stringify(initial),
          type: card.type,
          method: card.method,
          customer_id: card.customer_id,
          customer_name: card.customer_name.trim() || null,
          supplier_id: card.supplier_id,
          supplier_name: card.supplier_name.trim() || null,
          items: isItems ? card.items.map((i) => ({ product_id: i.product_id, name: i.name.trim(), unit: i.unit, quantity: i.quantity, unit_price: i.unit_price })) : [],
          paid,
          total: card.type === "expense" ? card.amount : null,
          expense_category: card.type === "expense" ? card.expense_category.trim() || null : null,
          raw_text: meta.raw_text,
        }),
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

  async function cancel() {
    if (meta.log_id) fetch("/api/extract", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ log_id: meta.log_id }) }).catch(() => {});
    onDone(false);
  }

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            {c.chooseType}
            <select value={card.type} onChange={(e) => set({ type: e.target.value as CardType })} className="min-h-11 rounded-xl border border-border bg-white px-3 text-base text-text">
              {card.type === "unknown" && <option value="unknown">{c.types.unknown}</option>}
              {TYPES.map((ty) => <option key={ty} value={ty}>{c.types[ty]}</option>)}
            </select>
          </label>
        ) : (
          <span className={`rounded-full px-3.5 py-1 text-[15px] font-bold ${BADGE[card.type]}`}>{c.types[card.type]}</span>
        )}
        <DaysAgo value={card.days_ago ?? 0} editing={editing} onChange={(d) => set({ days_ago: d })} />
        <span className={`text-[13px] ${meta.manual ? "font-semibold text-danger" : "text-muted"}`}>{meta.manual ? c.manualNote : c.aiNote}</span>
      </div>

      {meta.clarify_question && problems.length > 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-900">{meta.clarify_question}</p>
      )}

      <dl className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-3 text-[17px]">
        {(card.type === "sale" || card.type === "payment" || card.type === "unknown") && (
          <>
            <dt className="text-muted">{c.customer}</dt>
            <dd className="font-semibold">
              {editing ? (
                <input aria-label={c.customer} className={input} value={card.customer_name}
                  onChange={(e) => set({ customer_name: e.target.value, customer_id: null, due_before: null })} />
              ) : (
                <>{card.customer_name || "—"} {card.customer_name && !card.customer_id && <New label={c.newBadge} />}</>
              )}
              {card.due_before != null && card.due_before > 0 && (
                <span className="block text-sm font-normal text-muted">{c.dueNow} {taka(card.due_before)}</span>
              )}
            </dd>
          </>
        )}

        {(card.type === "purchase" || card.type === "supplier_payment") && (
          <>
            <dt className="text-muted">{c.supplier}</dt>
            <dd className="font-semibold">
              {editing ? (
                <input aria-label={c.supplier} className={input} value={card.supplier_name}
                  onChange={(e) => set({ supplier_name: e.target.value, supplier_id: null, supplier_due_before: null })} />
              ) : (
                <>{card.supplier_name || "—"} {card.supplier_name && !card.supplier_id && <New label={c.newBadge} />}</>
              )}
              {card.supplier_due_before != null && card.supplier_due_before > 0 && (
                <span className="block text-sm font-normal text-muted">{c.supplierDueNow} {taka(card.supplier_due_before)}</span>
              )}
            </dd>
          </>
        )}

        {isItems && card.items.map((it, i) => (
          <div key={i} className="col-span-2 grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-2">
            <dt className="text-muted">{c.product}</dt>
            <dd className="font-semibold">
              {editing ? (
                <div className="grid grid-cols-[1fr_80px_100px_auto] gap-2">
                  <input aria-label={c.product} className={input} value={it.name} onChange={(e) => setItem(i, { name: e.target.value, product_id: null, stock_before: null })} />
                  <input aria-label={c.quantity} className={`${input} ${unitMismatch(it) ? "border-2 border-amber-500 bg-amber-50" : ""}`} type="number" inputMode="decimal" min="0" value={it.quantity ?? ""} onChange={(e) => setItem(i, { quantity: num(e.target.value) })} />
                  <input aria-label={c.unitPrice} placeholder={c.unitPrice} className={input} type="number" inputMode="decimal" min="0" value={it.unit_price ?? ""} onChange={(e) => setItem(i, { unit_price: num(e.target.value), price_from_list: false })} />
                  <button type="button" onClick={() => set({ items: card.items.filter((_, j) => j !== i) })} className="min-h-11 px-2 text-sm text-danger">{c.removeItem}</button>
                  {it.price_from_list && <span className="col-span-4"><ListLabel label={c.listPrice} /></span>}
                </div>
              ) : (
                <>
                  {it.name} × {it.quantity == null ? "—" : formatNumber(it.quantity, lang)} {!it.product_id && <New label={c.newBadge} />}
                  <span className="block text-base font-normal text-muted">
                    {it.unit_price == null ? `${c.price}: —` : `${taka(it.unit_price)} × ${formatNumber(it.quantity ?? 0, lang)} = ${taka((it.quantity ?? 0) * it.unit_price)}`}
                    {it.price_from_list && <ListLabel label={c.listPrice} />}
                  </span>
                </>
              )}
              {unitMismatch(it) && (
                <PerUnitQuestion question={c.askPerUnit(it.unit!, t.units[it.product_unit!] ?? it.product_unit!)} unit={t.units[it.product_unit!] ?? ""}
                  presets={it.product_unit === "litre" ? LITRE_PRESETS : undefined} onAnswer={(n) => setItem(i, answerUnit(it, n))} />
              )}
              {it.ask_count && it.quantity == null && (
                <PerUnitQuestion question={c.askCount(t.units[it.ask_count])} unit={t.units[it.ask_count]}
                  onAnswer={(n) => setItem(i, { quantity: n, ask_count: null })} />
              )}
              {card.type === "sale" && it.stock_before != null && it.quantity != null && it.quantity > it.stock_before && (
                <span className="block text-sm font-normal text-warning">{c.stockWarn} {formatNumber(it.stock_before, lang)}</span>
              )}
            </dd>
          </div>
        ))}
        {isItems && editing && (
          <button type="button" className="col-span-2 min-h-11 justify-self-start text-primary underline"
            onClick={() => set({ items: [...card.items, { product_id: null, name: "", unit: null, quantity: 1, unit_price: null, stock_before: null }] })}>
            {c.addItem}
          </button>
        )}

        {isAmountType(card.type) && (
          <>
            <dt className="text-muted">{c.amount}</dt>
            <dd className="font-semibold">
              {editing ? <input aria-label={c.amount} className={input} type="number" inputMode="decimal" min="0" value={card.amount ?? ""} onChange={(e) => { set({ amount: num(e.target.value) }); setChange(null); }} /> : taka(card.amount)}
            </dd>
            {change != null && change > 0 && (
              <><dt className="text-muted">{c.changeBack}</dt><dd className="font-bold text-amber-700">{taka(change)}</dd></>
            )}
          </>
        )}
        {card.type === "expense" && (
          <>
            <dt className="text-muted">{c.category}</dt>
            <dd className="font-semibold">
              {editing ? <input aria-label={c.category} className={input} value={card.expense_category} onChange={(e) => set({ expense_category: e.target.value })} /> : card.expense_category || "—"}
            </dd>
          </>
        )}

        {isItems && (
          <>
            <dt className="text-muted">{c.total}</dt><dd className="font-semibold">{taka(total)}</dd>
            <dt className="text-muted">{c.paid}</dt><dd className="font-semibold text-green-700">{taka(card.paid_unknown ? null : paid)}</dd>
          </>
        )}
        {(card.type === "sale" || card.type === "purchase") && (
          <>
            <dt className="text-muted">{card.type === "purchase" ? c.owed : c.due}</dt>
            <dd className="font-bold text-danger">
              {editing ? <input aria-label={c.due} className={input} type="number" inputMode="decimal" min="0" value={card.paid_unknown ? "" : card.all_due ? due : card.due} onChange={(e) => set({ due: num(e.target.value) ?? 0, all_due: false, paid_unknown: false })} /> : taka(card.paid_unknown ? null : due)}
            </dd>
            {editing && card.type === "sale" && (
              <><dt className="text-muted">{c.received}</dt>
              <dd><input aria-label={c.received} className={input} type="number" inputMode="decimal" min="0" value={card.received ?? ""} onChange={(e) => set({ received: num(e.target.value) })} /></dd></>
            )}
            {saleChange != null && (
              <><dt className="text-muted">{c.changeBack}</dt><dd className="font-bold text-amber-700">{taka(saleChange)}{!editing && card.received != null && <span className="ml-2 text-sm font-normal text-muted">({c.received} {taka(card.received)})</span>}</dd></>
            )}
          </>
        )}
        {card.type !== "unknown" && (
          <>
            <dt className="text-muted">{c.method}</dt>
            <dd className="font-semibold">
              {editing ? (
                <select aria-label={c.method} value={card.method} onChange={(e) => set({ method: e.target.value as Method })} className={input}>
                  {METHOD_LIST.map((m) => <option key={m} value={m}>{c.methods[m]}</option>)}
                </select>
              ) : c.methods[card.method]}
            </dd>
          </>
        )}
      </dl>

      {card.paid_unknown && isItems && (
        <PaidQuestion question={card.type === "purchase" ? c.askPaidPurchase : c.askPaidSale} onAnswer={(a) => set(answerPaid(card, a))} onError={setError} />
      )}
      {problems.length === 0 ? (
        <Changes card={card} total={total} paid={paid} due={due} />
      ) : (
        <ul className="list-inside list-disc text-[15px] font-semibold text-danger" aria-live="polite">
          {problems.map((p) => <li key={p}>{t.errors[p]}</li>)}
        </ul>
      )}
      {problems.includes("PAYMENT_EXCEEDS_DUE") && card.due_before != null && card.due_before > 0 && card.amount != null && (
        // Customer handed over more than the due: take only the due, give the rest back
        <button type="button" onClick={() => { setChange(Math.round((card.amount! - card.due_before!) * 100) / 100); set({ amount: card.due_before }); }}
          className="min-h-11 rounded-xl border-2 border-amber-600 bg-amber-50 px-4 text-left text-[15px] font-semibold text-amber-800">
          {c.takeDueGiveBack(taka(card.due_before), taka(card.amount - card.due_before))}
        </button>
      )}
      {error && <p role="alert" className="font-semibold text-danger">{t.errors[error]}</p>}

      <button type="button" disabled={problems.length > 0 || saving} onClick={save}
        className="flex h-[54px] items-center justify-center gap-2.5 rounded-[14px] bg-success text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
        {saving ? c.saving : c.confirm}
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setEditing(!editing)} className="h-12 rounded-xl border border-border bg-white font-semibold text-primary">{editing ? c.doneEdit : c.edit}</button>
        <button type="button" onClick={cancel} disabled={saving} className="h-12 rounded-xl border border-red-200 bg-white font-semibold text-danger">{c.cancel}</button>
      </div>
    </div>
  );
}

// "কত টাকা দিয়েছে?" when the sentence said nothing about payment: never assume full cash.
function PaidQuestion({ question, onAnswer, onError }: {
  question: string; onAnswer: (a: "full" | "none" | number) => void; onError: (e: ErrorCode | null) => void;
}) {
  const { t } = useLanguage();
  const c = t.card;
  const [other, setOther] = useState(false);
  const [value, setValue] = useState("");
  const amount = num(value);
  const btn = "min-h-11 rounded-xl border-2 px-4 font-semibold";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="font-semibold text-amber-900">{question}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onAnswer("full")} className={`${btn} border-green-600 bg-white text-green-700`}>{c.paidFull}</button>
        <button type="button" onClick={() => onAnswer("none")} className={`${btn} border-red-300 bg-white text-danger`}>{c.paidNone}</button>
        <button type="button" onClick={() => setOther(true)} aria-pressed={other} className={`${btn} border-border bg-white text-primary`}>{c.paidOther}</button>
      </div>
      {other && (
        <div className="flex items-center gap-2">
          <input aria-label={c.paidAmount} placeholder={c.paidAmount} className={input} type="number" inputMode="decimal" min="0" autoFocus
            value={value} onChange={(e) => setValue(e.target.value)} />
          <MicButton small onText={(s) => { const n = numbersIn(s)[0]; if (n != null) setValue(String(n)); }} onError={onError} />
          <button type="button" disabled={amount == null || amount < 0} onClick={() => onAnswer(amount!)}
            className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-white disabled:opacity-50">{c.paidOk}</button>
        </div>
      )}
    </div>
  );
}

// "এক প্যাকেটে কত কেজি?" when the spoken unit isn't the product's unit: stock is counted in the product's unit.
// Loose oil (litre): "এক বোতলে কত লিটার?" offers common bottle sizes first, "অন্য" opens the number box.
const LITRE_PRESETS = [0.5, 1, 2, 5];
function PerUnitQuestion({ question, unit, presets, onAnswer }: { question: string; unit: string; presets?: number[]; onAnswer: (n: number) => void }) {
  const { t, lang } = useLanguage();
  const [value, setValue] = useState("");
  const [custom, setCustom] = useState(!presets);
  const n = num(value);
  const chip = "min-h-11 rounded-xl border border-amber-300 bg-white px-4 font-semibold text-amber-900";
  return (
    <span className="mt-2 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-normal">
      <span className="font-semibold text-amber-900">{question}</span>
      {presets && (
        <span className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} type="button" className={chip} onClick={() => onAnswer(p)}>{p === 0.5 ? "½" : formatNumber(p, lang)} {unit}</button>
          ))}
          {!custom && <button type="button" className={chip} onClick={() => setCustom(true)}>{t.card.perUnitOther}</button>}
        </span>
      )}
      {custom && (
        <span className="flex items-center gap-2">
          <input aria-label={question} className={input} type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="text-muted">{unit}</span>
          <button type="button" disabled={n == null || n <= 0} onClick={() => onAnswer(n!)}
            className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-white disabled:opacity-50">{t.card.paidOk}</button>
        </span>
      )}
    </span>
  );
}

function ListLabel({ label }: { label: string }) {
  return <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-semibold text-sky-800">{label}</span>;
}

function New({ label }: { label: string }) {
  return <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-bold text-amber-800">{label}</span>;
}

// "নিশ্চিত করলে যা বদলাবে" preview (mockup). Display only; the DB does the real update.
function Changes({ card, total, paid, due }: { card: Card; total: number | null; paid: number | null; due: number }) {
  const { t, lang } = useLanguage();
  const c = t.card;
  const lines: string[] = [];
  const n = (v: number) => formatNumber(v, lang);
  const today = !card.days_ago; // a past-dated entry doesn't move today's totals
  if (today && card.type === "sale" && total != null) lines.push(`${c.changeSales} +${formatTaka(total, lang)}`);
  if (today && ((card.type === "purchase" && total != null) || (card.type === "expense" && card.amount))) {
    lines.push(`${c.changeSpend} +${formatTaka(card.type === "expense" ? card.amount! : total!, lang)}`);
  }
  if (card.type === "sale" || card.type === "purchase") {
    const sign = card.type === "sale" ? -1 : 1;
    for (const it of card.items) {
      if (it.stock_before != null && it.quantity != null) lines.push(`${it.name} ${c.changeStock} ${n(it.stock_before)} → ${n(it.stock_before + sign * it.quantity)}`);
    }
  }
  if (card.type === "sale" && due > 0) lines.push(`${card.customer_name} ${c.changeDue} +${formatTaka(due, lang)}`);
  if (card.type === "purchase" && due > 0) lines.push(`${card.supplier_name} ${c.owed} +${formatTaka(due, lang)}`);
  if (card.type === "supplier_payment" && card.supplier_due_before != null && card.amount) {
    lines.push(`${card.supplier_name} ${c.owed} ${formatTaka(card.supplier_due_before, lang)} → ${formatTaka(card.supplier_due_before - card.amount, lang)}`);
  }
  if (card.type === "payment" && card.due_before != null && card.amount) {
    lines.push(`${card.customer_name} ${c.changeDue} ${formatTaka(card.due_before, lang)} → ${formatTaka(card.due_before - card.amount, lang)}`);
  }
  if (paid) lines.push(`${c.methods[card.method]} ${card.type === "sale" || card.type === "payment" ? "+" : "−"}${formatTaka(paid, lang)}`);
  if (!lines.length) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3.5 text-[15px] text-slate-600">
      <span>{c.changesTitle}</span>
      <span>{lines.map((l) => `• ${l}`).join(" · ")}</span>
    </div>
  );
}

// "গতকাল" chip; editable as a small select (today … 7 days ago). Said dates only go back, never forward.
export function DaysAgo({ value, editing, onChange }: { value: number; editing: boolean; onChange: (d: number) => void }) {
  const { t, lang } = useLanguage();
  const label = (d: number) => (d === 0 ? t.card.today : t.card.daysAgo(d, formatNumber(d, lang)));
  if (editing) {
    return (
      <select aria-label={t.card.when} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-h-11 rounded-xl border border-border bg-white px-3 text-base text-text">
        {Array.from({ length: Math.max(8, value + 1) }, (_, d) => <option key={d} value={d}>{label(d)}</option>)}
      </select>
    );
  }
  return value > 0 ? <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">{label(value)}</span> : null;
}
