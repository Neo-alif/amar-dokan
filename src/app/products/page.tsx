import { Suspense } from "react";
import { connection } from "next/server";
import { StatusFallback } from "@/components/home";
import { PageHeader } from "@/components/PageHeader";
import { ProductsView } from "@/components/ProductsView";
import { loadProducts } from "@/lib/db/queries";

async function ProductsData() {
  await connection(); // live DB read on every request
  const rows = await loadProducts().catch((e) => { console.error("products failed:", e); return null; });
  return <ProductsView rows={rows} />;
}

export default function ProductsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader section="products" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-18 sm:px-8">
        <Suspense fallback={<StatusFallback />}><ProductsData /></Suspense>
      </main>
    </div>
  );
}
