import { Suspense } from "react";
import { connection } from "next/server";
import { StatusFallback } from "@/components/home";
import { PageHeader } from "@/components/PageHeader";
import { ExpensesView } from "@/components/ExpensesView";
import { loadExpenses } from "@/lib/db/queries";

async function ExpensesData() {
  await connection(); // live DB read on every request
  const data = await loadExpenses().catch((e) => { console.error("expenses failed:", e); return null; });
  return <ExpensesView data={data} />;
}

export default function ExpensesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="expenses" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-18 sm:px-8">
        <Suspense fallback={<StatusFallback />}><ExpensesData /></Suspense>
      </main>
    </div>
  );
}
