"use client";
// /restock screen (docs/mockup/Restock.dc.html): budget in → ranked buying list with reasons + budget bar.
// চালু দোকান: restock() on the stock rows the server loaded (sales history).
// নতুন দোকান: planNewShop() on an editable starter template (data/starter/*.json). Page state only, nothing is saved.

import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import type { StockRow } from "@/lib/db/queries";
import { planNewShop, restock, PRIORITIES, type StarterItem } from "@/lib/logic/restock";
import { UNITS } from "@/lib/schema";
import { formatNumber, formatTaka } from "@/lib/format";
import grocery from "../../data/starter/grocery.json";
import stationery from "../../data/starter/stationery.json";

const DEFAULT_BUDGET = 5000;
const toNumber = (s: string) => Number(s.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[^\d.]/g, "")) || 0;

// cosmetics.json and clothing.json exist but are hidden from the selector for now
const TEMPLATES = { grocery, stationery };
type Category = keyof typeof TEMPLATES;
type Priority = StarterItem["priority"];
type Row = StarterItem & { key: string; custom?: boolean };
const fromTemplate = (c: Category): Row[] => (TEMPLATES[c].items as StarterItem[]).map((p, i) => ({ ...p, key: `${c}-${i}` }));

type TableRow = { key: string; name: string; unit: string; stock: number; qty: number; cost: number; priority: Priority; reason: string; detail?: string; item?: Row };

const PILL: Record<Priority, string> = { essential: "bg-red-50 text-danger", normal: "bg-amber-50 text-amber-700", optional: "bg-slate-100 text-muted" };
const field = "h-11 rounded-xl border-[1.5px] border-success bg-white px-3 outline-none";

export function RestockView({ rows }: { rows: StockRow[] | null }) {
  const { t, lang } = useLanguage();
  const r = t.restock;
  const [input, setInput] = useState(String(DEFAULT_BUDGET));
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [mode, setMode] = useState<"running" | "new">("running");
  const [category, setCategory] = useState<Category>("grocery");
  const [items, setItems] = useState<Row[]>(() => fromTemplate("grocery"));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", unit: "pcs", cost: "", qty: "10", priority: "normal" as Priority });
  const num = (n: number) => formatNumber(n, lang);
  const taka = (n: number) => formatTaka(n, lang);
  const card = "rounded-[20px] border-2 border-success bg-white shadow-[0_8px_22px_rgba(15,23,42,0.07)]";
  const isNew = mode === "new";

  if (!isNew && !rows) return <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 font-semibold text-danger">{t.stock.loadError}</p>;

  let table: TableRow[], spent: number, left: number, skipped: string[] = [];
  if (isNew) {
    const plan = planNewShop(items, budget);
    const bought = new Map(plan.items.map((l) => [l.key, l]));
    table = PRIORITIES.flatMap((tier) => items.filter((p) => p.priority === tier)).map((p) => {
      const l = bought.get(p.key);
      return {
        key: p.key, name: (lang === "en" && p.name_en) || p.name_bn, unit: p.unit, stock: 0, qty: l?.qty ?? 0, cost: l?.cost ?? 0, priority: p.priority, item: p,
        reason: p.custom ? r.reasonCustom : r.reasonNew,
        detail: !l ? r.notFit : l.qty < p.starter_qty ? r.partial(`${num(l.qty)}/${num(p.starter_qty)}`) : undefined,
      };
    });
    spent = plan.total; left = plan.remaining;
  } else {
    const byId = new Map(rows!.map((p) => [p.id, p]));
    const name = (id: string) => { const p = byId.get(id)!; return (lang === "en" && p.name_en) || p.name_bn; };
    const plan = restock(rows!, budget);
    table = plan.lines.map((l) => {
      const p = byId.get(l.id)!;
      const days = Math.floor(l.daysLeft);
      const when = l.daysLeft === 0 ? r.outNow : days === 0 ? r.today : r.endsIn(num(days));
      return {
        key: l.id, name: name(l.id), unit: p.unit, stock: p.stock, qty: l.qty, cost: l.cost, priority: days <= 2 ? "essential" : "normal",
        reason: r.reasonSales, detail: when + (l.qty < l.need ? ` · ${r.partial(`${num(l.qty)}/${num(l.need)}`)}` : ""),
      };
    });
    spent = plan.spent; left = plan.left; skipped = plan.skipped.map(name);
  }

  const update = (key: string, patch: Partial<Row>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const pickCategory = (c: Category) => { setCategory(c); setItems(fromTemplate(c)); };
  const draftCost = toNumber(draft.cost), draftQty = toNumber(draft.qty);
  const canAdd = draft.name.trim() !== "" && draftCost > 0 && draftQty > 0;
  const addRow = () => {
    if (!canAdd) return;
    const name = draft.name.trim();
    setItems((xs) => [...xs, { key: `custom-${Date.now()}`, custom: true, name_bn: name, name_en: name, unit: draft.unit, cost_price: draftCost, starter_qty: Math.floor(draftQty), daily_demand: 0, priority: draft.priority }]);
    setDraft({ name: "", unit: "pcs", cost: "", qty: "10", priority: "normal" });
    setAdding(false);
  };
  const th = "px-3 py-3 text-left text-sm font-semibold text-muted whitespace-nowrap";
  const td = "px-3 py-3 align-middle";

  return (
    <>
      <form className={`${card} flex flex-wrap items-end gap-5 p-6`} onSubmit={(e) => { e.preventDefault(); setBudget(toNumber(input)); }}>
        <div className="flex w-full flex-wrap gap-5">
          <div role="group" aria-label={r.mode} className="flex flex-col gap-2">
            <span className="font-semibold">{r.mode}</span>
            <span className="flex rounded-[14px] border-[1.5px] border-success p-1">
              {(["new", "running"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                  className={`min-h-10 rounded-[10px] px-4 font-semibold ${mode === m ? "bg-success text-white" : "text-green-700"}`}>
                  {m === "new" ? r.modeNew : r.modeRunning}
                </button>
              ))}
            </span>
          </div>
          {isNew && (
            <label className="flex flex-col gap-2">
              <span className="font-semibold">{r.category}</span>
              <select value={category} onChange={(e) => pickCategory(e.target.value as Category)} className={`${field} h-12 font-semibold`}>
                {(Object.keys(TEMPLATES) as Category[]).map((c) => (
                  <option key={c} value={c}>{lang === "en" ? TEMPLATES[c].category_en : TEMPLATES[c].category_bn}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
          <span className="font-semibold">{r.budgetLabel}</span>
          <span className="flex h-14 items-center gap-2 rounded-[14px] border-[1.5px] border-success px-4">
            <span className="text-[22px] font-bold text-green-700">৳</span>
            <input aria-label={r.budget} inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)}
              className="w-full min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none" />
          </span>
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-success px-4.5 text-[15px] font-semibold text-white">{r.calculate}</button>
      </form>

      <section className={`${card} flex flex-col gap-2.5 px-6 py-5`}>
        <div className="flex flex-wrap justify-between gap-2">
          <strong>{r.usage}</strong>
          <span>{r.total} <strong className="text-green-700">{taka(spent)}</strong> / {taka(budget)} · {r.left} {taka(left)}</span>
        </div>
        <div className="h-3.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-success" style={{ width: `${budget > 0 ? Math.min(100, (spent / budget) * 100) : 0}%` }} />
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="border-b-2 border-green-50 px-5 py-4"><strong className="text-lg">{isNew ? r.listTitleNew : r.listTitle}</strong></div>
        {table.length === 0 && skipped.length === 0 && <p className="px-5 py-6 text-muted">{isNew ? r.newEmpty : r.nothing}</p>}
        {table.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={th}>{r.col.product}</th>
                  <th className={th}>{r.col.stock}</th>
                  {isNew && <th className={th}>{r.col.price}</th>}
                  <th className={th}>{r.col.qty}</th>
                  <th className={`${th} text-right`}>{r.col.cost}</th>
                  <th className={th}>{r.col.priority}</th>
                  <th className={th}>{r.col.reason}</th>
                  {isNew && <th className={th}><span className="sr-only">{r.remove}</span></th>}
                </tr>
              </thead>
              <tbody>
                {table.map((row) => {
                  const unit = t.units[row.unit] ?? row.unit;
                  return (
                    <tr key={row.key} className="border-b border-slate-100">
                      <td className={td}><strong className="text-[17px]">{row.name}</strong></td>
                      <td className={`${td} whitespace-nowrap`}>{num(row.stock)} {unit}</td>
                      {isNew && row.item && (
                        <td className={td}>
                          <span className="flex items-center gap-1">
                            <span className="font-bold text-green-700">৳</span>
                            <input aria-label={`${r.col.price}: ${row.name}`} inputMode="decimal" value={row.item.cost_price || ""}
                              onChange={(e) => update(row.key, { cost_price: toNumber(e.target.value) })} className={`${field} h-10 w-24`} />
                          </span>
                        </td>
                      )}
                      <td className={`${td} whitespace-nowrap font-semibold`}>{num(row.qty)} {unit}</td>
                      <td className={`${td} text-right text-[17px] font-bold whitespace-nowrap`}>{taka(row.cost)}</td>
                      <td className={td}><span className={`rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap ${PILL[row.priority]}`}>{r.priority[row.priority]}</span></td>
                      <td className={td}>
                        <span className="flex flex-col text-sm">
                          <span>{row.reason}</span>
                          {row.detail && <span className={row.priority === "essential" || !row.qty ? "text-danger" : "text-amber-700"}>{row.detail}</span>}
                        </span>
                      </td>
                      {isNew && (
                        <td className={td}>
                          <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.key !== row.key))} aria-label={`${r.remove}: ${row.name}`}
                            className="min-h-10 rounded-lg border border-red-200 px-3 text-sm font-semibold text-danger">{r.remove}</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {skipped.length > 0 && <p className="px-5 py-4 text-sm text-muted">{r.skipped} {skipped.join(", ")}</p>}
        {isNew && (
          <div className="px-5 py-4">
            {!adding ? (
              <button type="button" onClick={() => setAdding(true)} className="min-h-11 rounded-xl border-[1.5px] border-success px-4 font-semibold text-green-700">{r.add}</button>
            ) : (
              <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); addRow(); }}>
                <label className="flex flex-[1_1_180px] flex-col gap-1 text-sm font-semibold">{r.addName}
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} /></label>
                <label className="flex flex-col gap-1 text-sm font-semibold">{r.addUnit}
                  <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={field}>
                    {UNITS.map((u) => <option key={u} value={u}>{t.units[u] ?? u}</option>)}
                  </select></label>
                <label className="flex w-28 flex-col gap-1 text-sm font-semibold">{r.addCost}
                  <input inputMode="decimal" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} className={field} /></label>
                <label className="flex w-24 flex-col gap-1 text-sm font-semibold">{r.addQty}
                  <input inputMode="numeric" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} className={field} /></label>
                <label className="flex flex-col gap-1 text-sm font-semibold">{r.col.priority}
                  <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })} className={field}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{r.priority[p]}</option>)}
                  </select></label>
                <button type="submit" disabled={!canAdd} className="min-h-11 rounded-xl bg-success px-4 font-semibold text-white disabled:opacity-50">{r.addSubmit}</button>
                <button type="button" onClick={() => setAdding(false)} className="min-h-11 rounded-xl px-3 font-semibold text-muted">{r.cancel}</button>
              </form>
            )}
          </div>
        )}
      </section>
      <p className="text-sm text-muted">{isNew ? r.newRule : r.rule}</p>
    </>
  );
}
