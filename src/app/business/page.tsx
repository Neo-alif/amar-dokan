import { Suspense } from "react";
import { connection } from "next/server";
import { StatusFallback } from "@/components/home";
import { PageHeader } from "@/components/PageHeader";
import { BusinessView } from "@/components/BusinessView";
import { loadBusiness } from "@/lib/db/queries";
import { PERIODS, type Period } from "@/lib/logic/business";

type Params = Promise<{ p?: string }>;

async function BusinessData({ searchParams }: { searchParams: Params }) {
  await connection(); // live DB read on every request
  const { p } = await searchParams;
  const period: Period = PERIODS.includes(p as Period) ? (p as Period) : "month";
  const data = await loadBusiness(period).catch((e) => { console.error("business data failed:", e); return null; });
  return <BusinessView data={data} period={period} />;
}

export default function BusinessPage({ searchParams }: { searchParams: Params }) {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="business" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-7 pb-18 sm:px-8">
        <Suspense fallback={<StatusFallback />}><BusinessData searchParams={searchParams} /></Suspense>
      </main>
    </div>
  );
}
