import { Suspense } from "react";
import { connection } from "next/server";
import { FloatingMic, Hero, StatusFallback, TopBar, WeekStatusView } from "@/components/home";
import { MoneyView } from "@/components/MoneyView";
import { loadHomeData, loadMoney } from "@/lib/db/queries";

// Live shop numbers: read on every request (not prerendered), streamed in behind a fallback.
async function WeekStatus() {
  await connection();
  // each view shows its own Bangla error message if its data fails
  const [data, money] = await Promise.all([
    loadHomeData().catch((e) => { console.error("home data failed:", e); return null; }),
    loadMoney().catch((e) => { console.error("money position failed:", e); return null; }),
  ]);
  return <><MoneyView money={money} home={data} /><WeekStatusView data={data} /></>;
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <TopBar />
      <Hero />
      <Suspense fallback={<StatusFallback />}>
        <WeekStatus />
      </Suspense>
      <FloatingMic />
    </div>
  );
}
