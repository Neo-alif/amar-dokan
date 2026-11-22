import { Suspense } from "react";
import { connection } from "next/server";
import { StatusFallback } from "@/components/home";
import { PageHeader } from "@/components/PageHeader";
import { StockView } from "@/components/StockView";
import { loadStock } from "@/lib/db/queries";

async function StockData() {
  await connection(); // live DB read on every request
  const rows = await loadStock().catch((e) => { console.error("stock data failed:", e); return null; });
  return <StockView rows={rows} />;
}

export default function StockPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="stock" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-18 sm:px-8">
        <Suspense fallback={<StatusFallback />}><StockData /></Suspense>
      </main>
    </div>
  );
}
