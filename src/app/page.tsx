import { Suspense } from "react";
import { connection } from "next/server";
import { FloatingMic, Hero, StatusFallback, TopBar, WeekStatusView } from "@/components/home";
import { loadHomeData } from "@/lib/db/queries";

// Live shop numbers: read on every request (not prerendered), streamed in behind a fallback.
async function WeekStatus() {
  await connection();
  const data = await loadHomeData().catch((e) => {
    console.error("home data failed:", e);
    return null; // view shows the Bangla error message
  });
  return <WeekStatusView data={data} />;
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
