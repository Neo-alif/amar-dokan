import { Suspense } from "react";
import { connection } from "next/server";
import { StatusFallback } from "@/components/home";
import { PageHeader } from "@/components/PageHeader";
import { DuesView } from "@/components/DuesView";
import { loadDues } from "@/lib/db/queries";

async function DuesData() {
  await connection(); // live DB read on every request
  const rows = await loadDues().catch((e) => { console.error("dues data failed:", e); return null; });
  return <DuesView data={rows} />;
}

export default function DuesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="dues" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-18 sm:px-8">
        <Suspense fallback={<StatusFallback />}><DuesData /></Suspense>
      </main>
    </div>
  );
}
