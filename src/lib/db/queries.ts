import { db, shopId } from "./client.ts";
import type { ShopContext } from "../ai/extract.ts";
import {
  byProduct, dhakaMonthStart, dhakaWeekStart, monthSummary, oldestDueDays, pickActions, todayNumbers, weekSellers, weeklyProfit, type SaleLine,
} from "../logic/summary.ts";
import { addDays, dailySeries, dhakaDay, forecast, stockOutlook } from "../logic/forecast.ts";
import { moneyPosition, type Account } from "../logic/money.ts";
import {
  businessPosition, dailySales, expenseBreakdown, expenseMonth, periodRange, profitAndLoss, topProducts, type Period,
} from "../logic/business.ts";
import { todayTotals, txnPeriodStart, type TxnPeriod } from "../logic/ledger.ts";

const one = <T>(x: T | T[]) => (Array.isArray(x) ? x[0] : x); // PostgREST embeds may come back as arrays

// PostgREST returns at most 1000 rows per request, so read in pages.
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`${what}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

// Everything the home page, insight and report need, read once.
async function loadShopNumbers(now: Date) {
  const shop = shopId();
  const since = new Date(Math.min(dhakaMonthStart(now, -1).getTime(), dhakaWeekStart(now).getTime() - 7 * 864e5)).toISOString();
  const [today, shopRow, customers, stock, rawLines, ledger, spend] = await Promise.all([
    db().from("today_summary").select("sales, spend").eq("shop_id", shop).maybeSingle(),
    db().from("shops").select("name").eq("id", shop).maybeSingle(),
    db().from("customers").select("id, name, due_balance").eq("shop_id", shop),
    loadStock(now),
    all((a, b) => db().from("transaction_items")
      .select("id, product_id, quantity, unit_price, products(cost_price), transactions!inner(occurred_at, type, shop_id)")
      .eq("transactions.shop_id", shop).eq("transactions.type", "sale").gte("transactions.occurred_at", since)
      .order("id").range(a, b), "sale lines"),
    all((a, b) => db().from("customer_ledger").select("id, customer_id, change, occurred_at").eq("shop_id", shop).order("id").range(a, b), "ledger"),
    // খরচ = expenses only; a purchase is stock (an asset), not spend (see logic/business.ts)
    all((a, b) => db().from("transactions").select("id, occurred_at, total").eq("shop_id", shop)
      .eq("type", "expense").gte("occurred_at", since).order("id").range(a, b), "spend"),
  ]);
  for (const r of [today, shopRow, customers]) if (r.error) throw new Error(`shop numbers: ${r.error.message}`);

  const lines: SaleLine[] = rawLines.map((r) => ({
    occurred_at: one(r.transactions).occurred_at, product_id: r.product_id,
    quantity: Number(r.quantity), unit_price: Number(r.unit_price), cost_price: Number(one(r.products).cost_price),
  }));
  const dues = customers.data!.filter((c) => Number(c.due_balance) > 0).map((c) => ({
    customer: c.name, due: Number(c.due_balance),
    days: oldestDueDays(ledger.filter((e) => e.customer_id === c.id).map((e) => ({ change: Number(e.change), occurred_at: e.occurred_at })), now),
  }));
  return {
    shopName: shopRow.data?.name ?? "",
    todaySales: Number(today.data?.sales ?? 0),
    todaySpend: Number(today.data?.spend ?? 0),
    totalDue: customers.data!.reduce((s, c) => s + Number(c.due_balance), 0),
    stock, lines, dues,
    spend: spend.map((r) => ({ occurred_at: r.occurred_at, total: Number(r.total) })),
  };
}

const namesOf = (stock: StockRow[]) => Object.fromEntries(stock.map((p) => [p.id, { bn: p.name_bn, en: p.name_en ?? p.name_bn }]));

// Home page: stat strip, weekly profit, এখন যা করবেন.
export async function loadHomeData(now = new Date()) {
  const n = await loadShopNumbers(now);
  return {
    todaySales: n.todaySales,
    todaySpend: n.todaySpend,
    lowStock: n.stock.filter((p) => p.status !== "ok").length, // same rule as /stock (forecast.ts)
    weekStart: dhakaWeekStart(now).toISOString(),
    week: weeklyProfit(n.lines, now),
    actions: pickActions(n.stock, n.dues, n.lines, now),
    sellers: weekSellers(n.lines, n.stock.map((p) => p.id), now),
    names: namesOf(n.stock),
    units: Object.fromEntries(n.stock.map((p) => [p.id, p.unit])),
  };
}
export type HomeData = Awaited<ReturnType<typeof loadHomeData>>;

// Verified numbers for the AI insight + monthly audit (the LLM sees only these).
export async function loadInsightNumbers(now = new Date()) {
  const n = await loadShopNumbers(now);
  const oldDues = n.dues.filter((d) => d.days !== null && d.days > 7);
  return {
    shopName: n.shopName,
    names: namesOf(n.stock),
    today: { ...todayNumbers(n.lines, now), spend: n.todaySpend },
    month: monthSummary(n.lines, n.spend, now),
    totalDue: n.totalDue,
    oldDue: { customers: oldDues.length, total: oldDues.reduce((s, d) => s + d.due, 0) },
    lowStock: n.stock.filter((p) => p.status !== "ok").sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9))
      .map((p) => ({ id: p.id, daysLeft: p.daysLeft === null ? null : Math.floor(p.daysLeft) })),
  };
}
export type InsightNumbers = Awaited<ReturnType<typeof loadInsightNumbers>>;

export async function loadShopContext(lang: ShopContext["lang"]): Promise<ShopContext> {
  const shop = shopId();
  const [products, customers, suppliers] = await Promise.all([
    db().from("products").select("id, name_bn, name_en, aliases, unit, sell_price, stock_qty").eq("shop_id", shop),
    db().from("customers").select("id, name, due_balance").eq("shop_id", shop),
    db().from("suppliers").select("id, name, due_balance").eq("shop_id", shop),
  ]);
  if (products.error) throw new Error(`load products: ${products.error.message}`);
  if (customers.error) throw new Error(`load customers: ${customers.error.message}`);
  if (suppliers.error) throw new Error(`load suppliers: ${suppliers.error.message}`);
  return { products: products.data, customers: customers.data, suppliers: suppliers.data, lang };
}

export async function updateAiLog(
  id: string,
  patch: { status: "confirmed" | "edited" | "rejected"; final?: unknown; transaction_id?: string },
): Promise<void> {
  const { error } = await db().from("ai_logs").update(patch).eq("id", id).eq("shop_id", shopId());
  if (error) console.error("ai_logs update failed:", error.message); // never block the save over a log row
}

export async function logAi(row: {
  input_text: string; lang: string; provider?: string; model?: string;
  extracted?: unknown; status: "extracted" | "failed"; latency_ms?: number;
}): Promise<string | null> {
  const { data, error } = await db().from("ai_logs").insert({ ...row, shop_id: shopId() }).select("id").single();
  if (error) { console.error("ai_logs insert failed:", error.message); return null; } // logging must not break extraction
  return data.id;
}

// Every product with its 7-day forecast, days left and status (used by /stock, home and /restock).
export async function loadStock(now = new Date()) {
  const shop = shopId();
  const today = dhakaDay(now);
  const yesterday = addDays(today, -1); // forecast from complete days only
  const { data: products, error } = await db().from("products")
    .select("id, name_bn, name_en, unit, stock_qty, reorder_level, cost_price, sell_price").eq("shop_id", shop);
  if (error) throw new Error(`products: ${error.message}`);

  const rows = await all((a, b) => db().from("daily_product_sales").select("product_id, day, qty_sold")
    .eq("shop_id", shop).gte("day", addDays(today, -90)).lte("day", yesterday)
    .order("product_id").order("day").range(a, b), "daily sales");
  const sales = new Map<string, { day: string; qty: number }[]>();
  for (const r of rows) {
    if (!sales.has(r.product_id)) sales.set(r.product_id, []);
    sales.get(r.product_id)!.push({ day: r.day, qty: Number(r.qty_sold) });
  }

  return products.map((p) => {
    const hist = sales.get(p.id) ?? [];
    const first = hist[0]?.day; // history starts at the product's first sale
    const f = first ? forecast(dailySeries(hist, first, yesterday), first) : null;
    const stock = Number(p.stock_qty), reorder = Number(p.reorder_level);
    return {
      id: p.id, name_bn: p.name_bn, name_en: p.name_en as string | null, unit: p.unit,
      stock, reorder_level: reorder, cost_price: Number(p.cost_price), sell_price: Number(p.sell_price),
      forecast: f?.daily ?? null, avg: f?.avg ?? null,
      ...stockOutlook(stock, reorder, f?.avg ?? null),
    };
  });
}
export type StockRow = Awaited<ReturnType<typeof loadStock>>[number];

// /dues: customers with baki (biggest first), each with a short ledger, plus summary numbers.
export async function loadDues(now = new Date()) {
  const shop = shopId();
  const [customers, ledger] = await Promise.all([
    db().from("customers").select("id, name, due_balance").eq("shop_id", shop),
    all((a, b) => db().from("customer_ledger")
      .select("id, customer_id, change, occurred_at, transactions(type, transaction_items(quantity, products(name_bn, name_en, unit)))")
      .eq("shop_id", shop).order("id").range(a, b), "ledger"),
  ]);
  if (customers.error) throw new Error(`customers: ${customers.error.message}`);

  const weekStart = dhakaWeekStart(now).getTime();
  const entries = ledger.map((e) => {
    const tx = one(e.transactions);
    return {
      customer_id: e.customer_id, at: e.occurred_at, change: Number(e.change), type: tx?.type ?? null,
      items: (tx?.transaction_items ?? []).map((i) => {
        const p = one(i.products);
        return { bn: p?.name_bn ?? "", en: p?.name_en ?? p?.name_bn ?? "", qty: Number(i.quantity), unit: p?.unit ?? "pcs" };
      }),
    };
  });
  const list = customers.data.filter((c) => Number(c.due_balance) > 0).map((c) => {
    const mine = entries.filter((e) => e.customer_id === c.id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return {
      id: c.id, name: c.name, due: Number(c.due_balance),
      lastDays: mine[0] ? Math.floor((now.getTime() - Date.parse(mine[0].at)) / 864e5) : null,
      oldestDays: oldestDueDays(mine.map((e) => ({ change: e.change, occurred_at: e.at })), now),
      entries: mine.slice(0, 10).map((e) => ({ at: e.at, change: e.change, type: e.type, items: e.items })),
    };
  }).sort((a, b) => b.due - a.due);
  const old = list.filter((c) => c.oldestDays !== null && c.oldestDays > 7);
  return {
    customers: list,
    totalCustomers: customers.data.length,
    totalDue: list.reduce((s, c) => s + c.due, 0),
    oldTotal: old.reduce((s, c) => s + c.due, 0), oldCount: old.length,
    paidThisWeek: -entries.filter((e) => e.change < 0 && Date.parse(e.at) >= weekStart).reduce((s, e) => s + e.change, 0),
  };
}
export type DuesData = Awaited<ReturnType<typeof loadDues>>;

// টাকার অবস্থা: balances per account from the DB, customer dues (পাওনা), supplier dues (দেনা), count history.
export async function loadMoney() {
  const shop = shopId();
  const [pos, counts, customers, suppliers] = await Promise.all([
    db().rpc("money_position", { p_shop: shop }),
    db().from("money_counts").select("id, account, counted, expected, note, counted_at").eq("shop_id", shop)
      .order("counted_at", { ascending: false }).limit(20),
    db().from("customers").select("due_balance").eq("shop_id", shop).gt("due_balance", 0),
    db().from("suppliers").select("due_balance").eq("shop_id", shop).gt("due_balance", 0),
  ]);
  for (const r of [pos, counts, customers, suppliers]) if (r.error) throw new Error(`money: ${r.error.message}`);
  const rows = (pos.data as Record<string, string | null>[]).map((r) => ({
    account: r.account as Account, counted: r.counted == null ? null : Number(r.counted), counted_at: r.counted_at,
    money_in: Number(r.money_in), money_out: Number(r.money_out), balance: Number(r.balance),
  }));
  const sum = (xs: { due_balance: number }[]) => xs.reduce((s, x) => s + Number(x.due_balance), 0);
  return {
    ...moneyPosition(rows, sum(customers.data!), sum(suppliers.data!)),
    customerCount: customers.data!.length,
    supplierCount: suppliers.data!.length,
    history: counts.data!.map((c) => ({
      id: c.id as string, account: c.account as Account, counted: Number(c.counted), diff: Number(c.counted) - Number(c.expected),
      note: c.note as string | null, at: c.counted_at as string,
    })),
  };
}
export type MoneyData = Awaited<ReturnType<typeof loadMoney>>;

// ব্যবসার অবস্থা: balance sheet now + profit & loss and charts for the period (formulas in logic/business.ts).
export async function loadBusiness(period: Period, now = new Date()) {
  const shop = shopId();
  const r = periodRange(period, now);
  const since = new Date(r.prevStart).toISOString();
  const [money, dues, stock, rawLines, txns] = await Promise.all([
    loadMoney(), loadDues(now), loadStock(now),
    all((a, b) => db().from("transaction_items")
      .select("id, product_id, quantity, unit_price, products(cost_price), transactions!inner(occurred_at, type, shop_id)")
      .eq("transactions.shop_id", shop).eq("transactions.type", "sale").gte("transactions.occurred_at", since)
      .order("id").range(a, b), "sale lines"),
    all((a, b) => db().from("transactions").select("id, type, occurred_at, total, expense_category").eq("shop_id", shop)
      .neq("type", "sale").gte("occurred_at", since).order("id").range(a, b), "transactions"),
  ]);
  const lines: SaleLine[] = rawLines.map((l) => ({
    occurred_at: one(l.transactions).occurred_at, product_id: l.product_id,
    quantity: Number(l.quantity), unit_price: Number(l.unit_price), cost_price: Number(one(l.products).cost_price),
  }));
  const tx = txns.map((x) => ({ type: x.type, occurred_at: x.occurred_at, total: Number(x.total), expense_category: x.expense_category }));
  const pl = profitAndLoss(lines, tx, r.start, r.end), prev = profitAndLoss(lines, tx, r.prevStart, r.prevEnd);
  return {
    period, from: r.days[0], to: r.days[r.days.length - 1], updatedAt: now.toISOString(),
    position: businessPosition({
      cash: money.cash.balance, bank: money.bank.balance, bkash: money.bkash.balance,
      receivable: money.receivable, payable: money.payable, stock: stock.map((p) => ({ qty: p.stock, cost: p.cost_price })),
    }),
    cash: money.cash.balance, bankTotal: money.bankTotal,
    customers: dues.customers.length, oldCustomers: dues.oldCount, suppliers: money.supplierCount,
    products: stock.length, low: stock.filter((p) => p.status === "low").length, out: stock.filter((p) => p.status === "out").length,
    pl,
    salesChangePct: prev.revenue > 0 ? Math.round(((pl.revenue - prev.revenue) / prev.revenue) * 100) : null,
    marginChange: pl.marginPct !== null && prev.marginPct !== null ? Math.round((pl.marginPct - prev.marginPct) * 10) / 10 : null,
    daily: dailySales(lines, r.days),
    expenses: expenseBreakdown(tx, r.start, r.end, ""), // "" = no category → UI shows অন্যান্য
    top5: topProducts(lines, r.start, r.end).map((p) => ({ ...p, ...namesOf(stock)[p.id] })),
  };
}
export type BusinessData = Awaited<ReturnType<typeof loadBusiness>>;

// লেনদেন: every transaction since the period start (filtering by type happens in the view, so today's totals see all).
export async function loadTransactions(period: TxnPeriod, now = new Date()) {
  const shop = shopId();
  const since = txnPeriodStart(period, now).toISOString();
  const rows = await all((a, b) => db().from("transactions")
    .select("id, type, occurred_at, total, due, expense_category, raw_text, note, supplier_id, customers(name), suppliers(name), transaction_items(quantity, products(name_bn, name_en, unit))")
    .eq("shop_id", shop).gte("occurred_at", since).order("id").range(a, b), "transactions");
  const list = rows.map((r) => ({
    id: r.id as string, type: r.type as string, occurred_at: r.occurred_at as string, total: Number(r.total), due: Number(r.due),
    supplier_id: r.supplier_id as string | null, category: r.expense_category as string | null, raw: (r.note ?? r.raw_text) as string | null,
    party: one(r.customers)?.name ?? one(r.suppliers)?.name ?? null,
    items: (r.transaction_items ?? []).map((i) => {
      const p = one(i.products);
      return { bn: p?.name_bn ?? "", en: p?.name_en ?? p?.name_bn ?? "", qty: Number(i.quantity), unit: p?.unit ?? "pcs" };
    }),
  }));
  return { period, today: todayTotals(list, now), rows: list };
}
export type TransactionsData = Awaited<ReturnType<typeof loadTransactions>>;

// পণ্য: every product with prices, stock, 7-day forecast (from loadStock), names the AI understands, and qty sold this week.
export async function loadProducts(now = new Date()) {
  const shop = shopId();
  const since = dhakaWeekStart(now).toISOString();
  const [stock, aliases, rawLines] = await Promise.all([
    loadStock(now),
    db().from("products").select("id, aliases").eq("shop_id", shop),
    all((a, b) => db().from("transaction_items")
      .select("id, product_id, quantity, unit_price, transactions!inner(occurred_at, type, shop_id)")
      .eq("transactions.shop_id", shop).eq("transactions.type", "sale").gte("transactions.occurred_at", since)
      .order("id").range(a, b), "week sales"),
  ]);
  if (aliases.error) throw new Error(`aliases: ${aliases.error.message}`);
  const week = byProduct(rawLines.map((l) => ({
    occurred_at: one(l.transactions).occurred_at, product_id: l.product_id,
    quantity: Number(l.quantity), unit_price: Number(l.unit_price), cost_price: 0,
  })), Date.parse(since), now.getTime() + 1);
  return stock.map((p) => ({
    ...p,
    aliases: (aliases.data.find((a) => a.id === p.id)?.aliases ?? []) as string[],
    weekQty: Math.round((week.get(p.id)?.qty ?? 0) * 100) / 100,
  }));
}
export type ProductRow = Awaited<ReturnType<typeof loadProducts>>[number];

// খরচ: sales and expenses since last month's start → month totals, categories, and this month's expense list.
export async function loadExpenses(now = new Date()) {
  const shop = shopId();
  const start = dhakaMonthStart(now).getTime();
  const rows = await all((a, b) => db().from("transactions").select("id, type, occurred_at, total, expense_category, note, raw_text")
    .eq("shop_id", shop).in("type", ["sale", "expense"]).gte("occurred_at", dhakaMonthStart(now, -1).toISOString())
    .order("id").range(a, b), "expenses");
  const txns = rows.map((r) => ({ ...r, total: Number(r.total) }));
  return {
    ...expenseMonth(txns, now),
    list: txns.filter((x) => x.type === "expense" && Date.parse(x.occurred_at) >= start)
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
      .map((x) => ({ id: x.id as string, at: x.occurred_at as string, category: x.expense_category as string | null, text: (x.note ?? x.raw_text) as string | null, total: x.total })),
  };
}
export type ExpensesData = Awaited<ReturnType<typeof loadExpenses>>;

// সাপ্লায়ার: each supplier with what the shop still owes (দেনা) and the last time it paid them; biggest দেনা first.
export async function loadSuppliers() {
  const shop = shopId();
  const [suppliers, payments] = await Promise.all([
    db().from("suppliers").select("id, name, due_balance").eq("shop_id", shop),
    all((a, b) => db().from("transactions").select("id, supplier_id, occurred_at, total").eq("shop_id", shop)
      .eq("type", "payment").not("supplier_id", "is", null).order("id").range(a, b), "supplier payments"),
  ]);
  if (suppliers.error) throw new Error(`suppliers: ${suppliers.error.message}`);
  const last = new Map<string, { at: string; amount: number }>();
  for (const p of payments) {
    const seen = last.get(p.supplier_id);
    if (!seen || Date.parse(p.occurred_at) > Date.parse(seen.at)) last.set(p.supplier_id, { at: p.occurred_at, amount: Number(p.total) });
  }
  const list = suppliers.data.map((s) => ({ id: s.id as string, name: s.name as string, due: Number(s.due_balance), lastPayment: last.get(s.id) ?? null }))
    .sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));
  return { suppliers: list, total: list.reduce((s, x) => s + x.due, 0) };
}
export type SuppliersData = Awaited<ReturnType<typeof loadSuppliers>>;
