import { Suspense } from "react";
import { connection } from "next/server";
import { StatusFallback } from "@/components/home";
import { PageHeader } from "@/components/PageHeader";
import { TransactionsView } from "@/components/TransactionsView";
import { loadTransactions } from "@/lib/db/queries";
import { TXN_FILTERS, TXN_PERIODS, type TxnFilter, type TxnPeriod } from "@/lib/logic/ledger";

type Params = Promise<{ type?: string; p?: string }>;

async function TransactionsData({ searchParams }: { searchParams: Params }) {
  await connection(); // live DB read on every request
  const q = await searchParams;
  const period: TxnPeriod = TXN_PERIODS.includes(q.p as TxnPeriod) ? (q.p as TxnPeriod) : "today";
  const filter: TxnFilter = TXN_FILTERS.includes(q.type as TxnFilter) ? (q.type as TxnFilter) : "all";
  const data = await loadTransactions(period).catch((e) => { console.error("transactions failed:", e); return null; });
  return <TransactionsView data={data} period={period} filter={filter} />;
}

export default function TransactionsPage({ searchParams }: { searchParams: Params }) {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="transactions" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-18 sm:px-8">
        <Suspense fallback={<StatusFallback />}><TransactionsData searchParams={searchParams} /></Suspense>
      </main>
    </div>
  );
}
