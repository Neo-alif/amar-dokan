import { Suspense } from "react";
import { connection } from "next/server";
import { StatusFallback } from "@/components/home";
import { PageHeader } from "@/components/PageHeader";
import { SuppliersView } from "@/components/SuppliersView";
import { loadSuppliers } from "@/lib/db/queries";

async function SuppliersData() {
  await connection(); // live DB read on every request
  const data = await loadSuppliers().catch((e) => { console.error("suppliers failed:", e); return null; });
  return <SuppliersView data={data} />;
}

export default function SuppliersPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="suppliers" />
      <main className="mx-auto flex w-full max-w-[820px] flex-col gap-5 px-4 pt-8 pb-18 sm:px-8">
        <Suspense fallback={<StatusFallback />}><SuppliersData /></Suspense>
      </main>
    </div>
  );
}
