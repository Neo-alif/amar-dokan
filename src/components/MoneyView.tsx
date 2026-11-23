"use client";
// টাকার অবস্থা (docs/mockup/Main.dc.html) + the "মিলিয়ে নিন" dialog (docs/mockup/Reconcile.dc.html).
// Every number comes from the server; the dialog only shows the live difference while typing.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/i18n/LanguageContext";
import type { HomeData, MoneyData } from "@/lib/db/queries";
import { formatNumber, formatTaka } from "@/lib/format";
import { countDifference, type Account } from "@/lib/logic/money";

type Lang = "bn" | "en";
const locale = (lang: Lang) => (lang === "bn" ? "bn-BD" : "en-GB");
const dhakaDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

// "আজ ৯:১০ AM" for today, else "২২ নভে., ৯:১০ AM" (Asia/Dhaka)
function when(iso: string, lang: Lang, todayAt: (t: string) => string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(locale(lang), { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });
  if (dhakaDate(d) === dhakaDate(new Date())) return todayAt(time);
  return `${d.toLocaleDateString(locale(lang), { day: "numeric", month: "short", timeZone: "Asia/Dhaka" })}, ${time}`;
}
const signed = (n: number, lang: Lang) => `${n < 0 ? "−" : "+"}${formatTaka(Math.abs(n), lang)}`;

const TONES = {
  green: { box: "border-[#BBF7D0] border-t-success", icon: "bg-green-100", value: "text-success", btn: "border-success bg-success text-white" },
  blue: { box: "border-[#BFDBFE] border-t-[#1D4ED8]", icon: "bg-blue-100", value: "text-[#1D4ED8]", btn: "border-[#1D4ED8] bg-[#1D4ED8] text-white" },
  orange: { box: "border-[#FED7AA] border-t-[#EA580C]", icon: "bg-orange-100", value: "text-[#EA580C]", btn: "border-[#EA580C] bg-white text-[#EA580C]" },
  red: { box: "border-[#FECACA] border-t-danger", icon: "bg-red-100", value: "text-danger", btn: "border-danger bg-white text-danger" },
};

function MoneyCard({ tone, title, value, sub, action }: { tone: keyof typeof TONES; title: string; value: string; sub: string; action?: React.ReactNode }) {
  const c = TONES[tone];
  return (
    <article className={`flex min-h-[200px] flex-col gap-2 rounded-[20px] border-2 border-t-[6px] bg-white px-5.5 py-5 shadow-[0_10px_28px_rgba(15,23,42,0.07)] ${c.box}`}>
      <div className="flex items-center gap-2.5">
        <span className={`size-10 rounded-xl ${c.icon}`} aria-hidden="true" />
        <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
      </div>
      <div className={`text-[34px] leading-tight font-bold ${c.value}`}>{value}</div>
      <span className="text-sm text-muted">{sub}</span>
      {action && <div className="mt-auto">{action}</div>}
    </article>
  );
}

export function MoneyView({ money, home }: { money: MoneyData | null; home: HomeData | null }) {
  const { t, lang } = useLanguage();
  const m = t.money;
  const [dialog, setDialog] = useState<"cash" | "bank" | null>(null);
  const taka = (n: number) => formatTaka(n, lang);
  const btn = (tone: keyof typeof TONES) => `flex h-[42px] w-full items-center justify-center rounded-xl border-2 text-[15px] font-semibold ${TONES[tone].btn}`;
  const n = (v: number) => formatNumber(v, lang);

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 pt-12 pb-2 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex size-[52px] flex-none items-center justify-center rounded-2xl bg-green-100">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></svg>
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[32px] leading-tight font-bold text-primary">{m.title}</h2>
            <span className="block h-[5px] w-[72px] rounded-full bg-success" />
            <span className="mt-1 text-[15px] text-muted">{m.subtitle}</span>
          </div>
        </div>
        {money && (
          <div className="flex flex-col items-end rounded-[18px] bg-primary px-5.5 py-3">
            <span className="text-sm text-slate-300">{m.total}</span>
            <span className="text-[30px] leading-tight font-bold text-[#FBBF24]">{taka(money.total)}</span>
          </div>
        )}
      </div>

      {!money ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 font-semibold text-danger">{m.loadError}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyCard tone="green" title={m.cash} value={taka(money.cash.balance)}
            sub={money.cash.counted_at ? m.lastCount(when(money.cash.counted_at, lang, m.todayAt), signed(money.cash.money_in - money.cash.money_out, lang)) : m.neverCounted}
            action={<button type="button" onClick={() => setDialog("cash")} className={btn("green")}>{m.reconcile}</button>} />
          <MoneyCard tone="blue" title={m.bankBkash} value={taka(money.bankTotal)}
            sub={`${m.bank} ${taka(money.bank.balance)} · ${m.bkash} ${taka(money.bkash.balance)}`}
            action={<button type="button" onClick={() => setDialog("bank")} className={btn("blue")}>{m.reconcile}</button>} />
          <MoneyCard tone="orange" title={m.receivable} value={taka(money.receivable)} sub={m.customersOwe(n(money.customerCount))}
            action={<Link href="/dues" className={btn("orange")}>{m.duesLink}</Link>} />
          <MoneyCard tone="red" title={m.payable} value={taka(money.payable)}
            sub={money.supplierCount ? m.suppliersOwed(n(money.supplierCount)) : m.noPayable}
            action={<Link href="/suppliers" className={btn("red")}>{m.suppliersLink}</Link>} />
        </div>
      )}

      {home && (
        <div className="mt-4.5 flex flex-wrap items-center gap-x-4.5 gap-y-2.5 rounded-2xl border-2 border-border bg-white px-4.5 py-3">
          <strong className="text-primary">{m.today}</strong>
          <span>{m.sales} <strong className="text-green-700">{taka(home.todaySales)}</strong></span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span>{m.spend} <strong className="text-amber-700">{taka(home.todaySpend)}</strong></span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <Link href="/stock" className="text-text">{m.lowStock} <strong className="text-danger">{n(home.lowStock)}{m.countUnit}</strong> →</Link>
        </div>
      )}

      {money && dialog && <CountDialog kind={dialog} money={money} onClose={() => setDialog(null)} />}
    </section>
  );
}

function CountDialog({ kind, money, onClose }: { kind: "cash" | "bank"; money: MoneyData; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const m = t.money;
  const router = useRouter();
  const accounts: Account[] = kind === "cash" ? ["cash"] : ["bank", "bkash"];
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const taka = (n: number) => formatTaka(n, lang);

  const expected = kind === "cash" ? money.cash.balance : money.bankTotal;
  const filled = accounts.every((a) => values[a]?.trim() && Number(values[a]) >= 0);
  const counted = accounts.reduce((s, a) => s + (Number(values[a]) || 0), 0);
  const diff = filled ? countDifference(counted, expected) : null;
  const cash = money.cash;
  const history = money.history.filter((h) => accounts.includes(h.account)).slice(0, 5);

  async function save() {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/money", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ counts: accounts.map((a) => ({ account: a, counted: Number(values[a]) })), note: note.trim() || null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onClose();
      router.refresh(); // home numbers are server-rendered: read them again
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const field = "h-12 w-full rounded-xl border-[1.5px] border-border bg-white px-3.5 text-lg";
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="count-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="flex max-h-full w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-[20px] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.25)]">
        <div className="flex items-center justify-between">
          <h3 id="count-title" className="text-xl font-bold text-primary">{kind === "cash" ? m.cashTitle : m.bankTitle}</h3>
          <button type="button" onClick={onClose} aria-label={m.cancel} className="flex size-11 items-center justify-center rounded-xl text-xl text-muted hover:bg-bg">✕</button>
        </div>
        <div className="flex items-baseline justify-between rounded-xl bg-bg px-4 py-3">
          <span className="text-muted">{m.inApp}</span>
          <span className="text-2xl font-bold text-text">{taka(expected)}</span>
        </div>

        {accounts.map((a, i) => (
          <label key={a} className="flex flex-col gap-1.5">
            <span className="font-semibold text-slate-700">{a === "cash" ? m.cashAsk : a === "bank" ? m.bankAsk : m.bkashAsk}</span>
            <input autoFocus={i === 0} type="number" inputMode="decimal" min="0" value={values[a] ?? ""} placeholder="৳"
              onChange={(e) => setValues({ ...values, [a]: e.target.value })} className={field} />
          </label>
        ))}
        <p className="text-sm text-muted">
          {kind === "bank" ? m.bankHint
            : cash.counted_at && cash.counted != null ? m.formula(when(cash.counted_at, lang, m.todayAt), taka(cash.counted), taka(cash.money_in), taka(cash.money_out))
            : m.formulaNever(taka(cash.money_in), taka(cash.money_out))}
        </p>

        {diff != null && (
          <div className={`flex items-baseline justify-between rounded-xl px-4 py-3 ${diff === 0 ? "bg-green-50 text-green-700" : diff < 0 ? "bg-red-50 text-danger" : "bg-amber-50 text-amber-800"}`}>
            <span className="font-semibold">{m.diff}</span>
            <span className="text-xl font-bold">{diff === 0 ? taka(0) : `${signed(diff, lang)} (${diff < 0 ? m.less : m.more})`}</span>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">{m.note}</span>
          <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
        {error && <p role="alert" className="font-semibold text-danger">{t.errors.SERVER_ERROR}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-border bg-white font-semibold text-primary">{m.cancel}</button>
          <button type="button" onClick={save} disabled={!filled || saving} className="h-12 rounded-xl bg-success font-semibold text-white disabled:opacity-50">{saving ? m.saving : m.save}</button>
        </div>

        {history.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3.5">
            <span className="text-sm font-semibold text-slate-600">{m.history}</span>
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 text-[15px]">
                <span className="text-muted">{new Date(h.at).toLocaleDateString(locale(lang), { day: "numeric", month: "short", timeZone: "Asia/Dhaka" })}{kind === "bank" && ` · ${m[h.account as "bank" | "bkash"]}`}</span>
                <span className="flex-1 truncate">{h.note ?? "—"}</span>
                <span className={`font-semibold ${h.diff < 0 ? "text-danger" : h.diff > 0 ? "text-amber-700" : "text-green-700"}`}>{signed(h.diff, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
