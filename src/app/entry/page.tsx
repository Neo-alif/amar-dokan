"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmCard, type CardMeta } from "@/components/ConfirmCard";
import { MicButton } from "@/components/MicButton";
import { useLanguage } from "@/i18n/LanguageContext";
import type { ErrorCode } from "@/i18n/dictionary";
import { isAmountType, type Card, type CardType } from "@/lib/logic/card";
import { MAX_INPUT_CHARS } from "@/lib/logic/normalize";

// Shape returned by POST /api/extract (src/lib/ai/extract.ts → draft)
type Draft = {
  type: CardType; customer: string | null; customer_id: string | null; due_before: number | null;
  supplier: string | null; supplier_id: string | null; supplier_due_before: number | null;
  items: { product: string; product_id: string | null; unit: string | null; quantity: number | null; unit_price: number | null; stock_before: number | null }[];
  total: number | null; paid: number | null; received: number | null; due: number; ask_paid: boolean; method: Card["method"] | null; expense_category: string | null; clarify_question: string | null;
};

const toCard = (d: Draft): Card => ({
  type: d.type,
  method: d.method ?? "cash",
  customer_id: d.customer_id,
  customer_name: d.customer ?? "",
  due_before: d.due_before,
  supplier_id: d.supplier_id,
  supplier_name: d.supplier ?? "",
  supplier_due_before: d.supplier_due_before,
  items: d.items.map((i) => ({ product_id: i.product_id, name: i.product, unit: i.unit, quantity: i.quantity, unit_price: i.unit_price, stock_before: i.stock_before })),
  due: d.due,
  all_due: (d.type === "sale" || d.type === "purchase") && d.paid === 0, // "পুরোটাই বাকি": nothing paid
  received: d.type === "sale" ? d.received : null,
  paid_unknown: d.ask_paid,
  amount: isAmountType(d.type) ? d.total : null,
  expense_category: d.expense_category ?? "",
});

const EMPTY_CARD: Card = {
  type: "unknown", method: "cash", customer_id: null, customer_name: "", due_before: null,
  supplier_id: null, supplier_name: "", supplier_due_before: null,
  items: [{ product_id: null, name: "", unit: null, quantity: 1, unit_price: null, stock_before: null }],
  due: 0, all_due: false, received: null, paid_unknown: false, amount: null, expense_category: "",
};

type Opened = { key: number; card: Card; meta: CardMeta };

export default function EntryPage() {
  const { t, lang } = useLanguage();
  const e = t.entry;
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState<Opened | null>(null);
  const [clarify, setClarify] = useState<{ question: string; base: string; draft: Opened } | null>(null);
  const [answer, setAnswer] = useState("");

  // first ask: a missing price/amount shows the AI's question; the answer is sent with the sentence and goes to the card
  async function extract(input: string, allowClarify: boolean) {
    if (!input.trim() || thinking) return;
    setThinking(true);
    setError(null);
    setSaved(false);
    setOpen(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: input, lang }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const next = { key: Date.now(), card: toCard(body.draft), meta: { log_id: body.log_id, raw_text: input, manual: false, clarify_question: body.draft.clarify_question } };
        if (allowClarify && body.draft.clarify_question) { setAnswer(""); setClarify({ question: body.draft.clarify_question, base: input, draft: next }); }
        else { setClarify(null); setOpen(next); }
      } else {
        setError((body.error as ErrorCode) ?? "SERVER_ERROR");
        if (body.error === "AI_UNAVAILABLE") { setClarify(null); openManual(); } // owner fills the card by hand, clearly labelled
      }
    } catch {
      setError("NETWORK");
    } finally {
      setThinking(false);
    }
  }

  const send = () => extract(text, true);
  const sendAnswer = () => clarify && answer.trim() && extract(`${clarify.base}, ${answer.trim()}`.slice(0, MAX_INPUT_CHARS), false);

  function openManual() {
    setOpen({ key: Date.now(), card: EMPTY_CARD, meta: { log_id: null, raw_text: text || null, manual: true, clarify_question: null } });
  }

  function done(wasSaved: boolean) {
    setOpen(null);
    setSaved(wasSaved);
    if (wasSaved) setText("");
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="entry" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-wrap items-start gap-7 px-4 pt-10 pb-18 sm:px-8">
        <section className="flex min-w-0 flex-[1_1_460px] flex-col gap-4.5 rounded-[20px] border border-border bg-surface p-6 sm:p-8">
          <MicButton disabled={thinking} onError={setError} onText={(s) => { setText(s.slice(0, MAX_INPUT_CHARS)); setSaved(false); }} />
          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-slate-600">{e.typeLabel}</span>
            <textarea
              rows={3}
              maxLength={MAX_INPUT_CHARS}
              value={text}
              placeholder={e.placeholder}
              onChange={(ev) => setText(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(); } }}
              className="w-full resize-none rounded-[14px] border-[1.5px] border-accent px-4 py-3.5 text-[17px] text-text"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">{e.examplesHint}</span>
            <div className="flex flex-wrap gap-2">
              {e.samples.map((s) => (
                <button key={s} type="button" onClick={() => setText(s)}
                  className="min-h-11 rounded-full border border-border bg-bg px-3.5 text-sm text-primary hover:border-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={send} disabled={!text.trim() || thinking}
            className="h-[52px] w-full rounded-[14px] bg-primary text-lg font-semibold text-white disabled:opacity-50">
            {thinking ? e.thinking : e.send}
          </button>

          <div aria-live="polite" className="min-h-6">
            {error && <p className="font-semibold text-danger">{t.errors[error]}</p>}
            {saved && <p className="font-semibold text-success">{t.card.saved}</p>}
          </div>
          {!open && !clarify && !thinking && (
            <button type="button" onClick={openManual} className="min-h-11 self-start text-sm text-muted underline">{e.manualStart}</button>
          )}
        </section>

        <section className="flex min-w-0 flex-[1_1_460px] flex-col gap-4">
          {clarify && (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 border-l-4 border-l-warning bg-amber-50 px-5 py-4.5">
              <span className="text-sm font-bold text-amber-900">{e.clarifyTitle}</span>
              <p className="text-lg font-semibold text-text">{clarify.question}</p>
              <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); sendAnswer(); }}>
                <input autoFocus aria-label={clarify.question} value={answer} placeholder={e.clarifyPlaceholder} maxLength={100}
                  onChange={(ev) => setAnswer(ev.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-white px-3.5 text-base" />
                <MicButton small disabled={thinking} onError={setError} onText={setAnswer} />
                <button type="submit" disabled={!answer.trim() || thinking}
                  className="h-11 shrink-0 rounded-xl bg-primary px-4.5 font-semibold text-white disabled:opacity-50">
                  {thinking ? e.thinking : e.clarifyAnswer}
                </button>
              </form>
              <button type="button" onClick={() => { setOpen(clarify.draft); setClarify(null); }} className="min-h-11 self-start text-sm text-muted underline">{e.clarifySkip}</button>
            </div>
          )}
          {open && <ConfirmCard key={open.key} initial={open.card} meta={open.meta} onDone={done} />}
        </section>
      </main>
    </div>
  );
}
