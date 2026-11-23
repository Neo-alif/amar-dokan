"use client";
// Home status cards (docs/mockup/Main.dc.html): এখন যা করবেন (rules) and মাসিক অডিট রিপোর্ট (AI, number-checked).

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import type { HomeData, InsightNumbers } from "@/lib/db/queries";
import type { InsightText } from "@/lib/ai/insight";
import { formatNumber, formatTaka, modelName } from "@/lib/format";

export type Insight = InsightText & { numbers: InsightNumbers };

// Fetches /api/insight in the owner's language (the AI writes in that language). Live call every time,
// one per page view: each page mounts this hook once.
export function useInsight() {
  const { lang } = useLanguage();
  const [tries, setTries] = useState(0);
  const [res, setRes] = useState<{ key: string; data?: Insight; error?: "ai" | "server" } | null>(null);
  const key = `${lang}:${tries}`;
  useEffect(() => {
    let alive = true;
    // Abort on cleanup (StrictMode remount, language switch, leaving the page) so the server stops that AI call.
    const ctrl = new AbortController();
    fetch("/api/insight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang }), signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 503) return alive && setRes({ key, error: "ai" }); // every AI model failed
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as Insight;
        if (alive) setRes({ key, data });
      })
      .catch(() => alive && setRes({ key, error: "server" }));
    return () => { alive = false; ctrl.abort(); };
  }, [key, lang]);
  const current = res?.key === key ? res : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !current, retry: () => setTries((n) => n + 1) };
}

// AI unavailable (or server error) + retry. No rule-written stand-in.
export function InsightError({ error, retry, center }: { error: "ai" | "server"; retry: () => void; center?: boolean }) {
  const s = useLanguage().t.insight;
  return (
    <div role="alert" className={`flex flex-col gap-2 ${center ? "items-center" : "items-start"}`}>
      <p className="text-danger">{error === "ai" ? s.aiUnavailable : s.loadError}</p>
      <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-primary">{s.retry}</button>
    </div>
  );
}

const Sparkle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
  </svg>
);

export function ActionsCard({ data }: { data: HomeData }) {
  const { t, lang } = useLanguage();
  const a = t.actions;
  const name = (id: string) => data.names[id]?.[lang] ?? "";
  const num = (n: number) => formatNumber(n, lang);
  const STYLE = {
    urgent: ["bg-red-50", "bg-danger text-white", a.urgent],
    watch: ["bg-amber-50", "bg-amber-700 text-white", a.watch],
    tip: ["bg-bg", "bg-border text-primary", a.tip],
  } as const;
  return (
    <article className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-t-[6px] border-red-200 border-t-orange-500 bg-white p-6 shadow-[0_10px_28px_rgba(249,115,22,0.10)]">
      <h3 className="text-lg font-semibold text-slate-600">{a.title}</h3>
      {data.actions.length === 0 ? <p className="text-muted">{a.none}</p> : (
        <ul className="flex flex-col gap-2.5">
          {data.actions.map((x, i) => {
            const [bg, chip, label] = STYLE[x.kind];
            const text = x.kind === "urgent"
              ? x.daysLeft === 0 ? a.outText(name(x.product_id)) : a.urgentText(name(x.product_id), x.daysLeft < 1 ? null : num(Math.floor(x.daysLeft)))
              : x.kind === "watch" ? a.watchText(x.customer, formatTaka(x.due, lang), num(x.days))
              : a.tipText(x.product_ids.map(name).join(t.insight.and));
            return (
              <li key={i} className={`flex items-start gap-3 rounded-xl p-3 ${bg}`}>
                <span className={`mt-0.5 flex-none rounded-full px-2 text-xs font-bold ${chip}`}>{label}</span>
                <span className="text-[15px]">{text}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/restock" className="mt-auto text-[15px] font-semibold text-primary hover:text-accent">{a.restockLink}</Link>
    </article>
  );
}

export function AuditCard() {
  const { t } = useLanguage();
  const s = t.insight;
  const { data, error, loading, retry } = useInsight();
  return (
    <article className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-t-[6px] border-violet-200 border-t-accent bg-white p-6 shadow-[0_10px_28px_rgba(109,40,217,0.10)]">
      <div className="flex items-center gap-2">
        <Sparkle />
        <h3 className="text-lg font-semibold text-slate-600">{s.title}</h3>
        {data && <span className="ml-auto text-[13px] text-muted">{data.monthName}</span>}
      </div>
      {loading && <p className="animate-pulse text-muted" aria-live="polite">{s.writing}</p>}
      {error && <InsightError error={error} retry={retry} />}
      {data && (
        <>
          <p className="rounded-xl bg-violet-50 p-3 text-[15px]"><strong>{s.todayLabel}:</strong> {data.today}</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">
            {data.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-accent">{s.aiBy(modelName(data.model))}</span>
            <span>{s.verified}</span>
          </div>
        </>
      )}
      <div className="mt-auto flex flex-wrap gap-2.5">
        <Link href="/report?print=1" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-[15px] font-semibold text-white">{s.pdf}</Link>
        <Link href="/report" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-white px-4 text-[15px] font-semibold text-primary">{s.fullReport}</Link>
      </div>
    </article>
  );
}
