"use client";
// Home page pieces, built to match docs/mockup/Main.dc.html.

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";
import type { HomeData } from "@/lib/db/queries";
import { formatNumber, formatTaka } from "@/lib/format";
import { ActionsCard, AuditCard } from "@/components/insightCards";

const MicIcon = ({ size, stroke }: { size: number; stroke: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
  </svg>
);

// Pages that exist (optional Products / Expenses / Transactions pages are not built, so not linked).
const PAGES = [
  { href: "/entry", key: "entry", stroke: "#6D28D9", tile: "", d: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></> },
  { href: "/stock", key: "stock", stroke: "#1D4ED8", tile: "bg-blue-50 border-blue-200", d: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></> },
  { href: "/dues", key: "dues", stroke: "#DC2626", tile: "bg-red-50 border-red-200", d: <><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z" /><path d="M8 9h8" /><path d="M8 13h6" /></> },
  { href: "/restock", key: "restock", stroke: "#16A34A", tile: "bg-green-50 border-green-200", d: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 12h12l2-8H6" /></> },
  { href: "/report", key: "report", stroke: "#0F766E", tile: "", d: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7" /><path d="M9 16h5" /></> },
] as const;
type Page = (typeof PAGES)[number];

const PageIcon = ({ page, size }: { page: Page; size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={page.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{page.d}</svg>
);

// Menu boxes under the status cards (mockup: 48px icon square + label).
export function MenuTiles() {
  const { t } = useLanguage();
  return (
    <div className="mt-6 grid grid-cols-3 gap-4">
      {PAGES.filter((p) => p.tile).map((p) => (
        <Link key={p.href} href={p.href} className={`flex flex-col items-center gap-2.5 rounded-[20px] border-[1.5px] px-3 py-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] ${p.tile}`}>
          <span className="flex size-12 items-center justify-center rounded-[14px] bg-white shadow-[0_2px_6px_rgba(15,23,42,0.08)]"><PageIcon page={p} size={24} /></span>
          <span className="text-center font-semibold text-text">{t[p.key].title}</span>
        </Link>
      ))}
    </div>
  );
}

export function TopBar() {
  const { t, lang, setLang } = useLanguage();
  const [menu, setMenu] = useState(false);
  const pill = (active: boolean) => `h-9 rounded-full px-3.5 text-[15px] font-bold ${active ? "bg-[#FBBF24] text-primary" : "text-white"}`;
  return (
    <header className="relative border-b border-[#27466E] bg-primary">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#FBBF24]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F3A5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 13v7h14v-7" /><path d="M10 20v-4h4v4" /></svg>
          </span>
          <span className="text-[22px] font-bold">{lang === "bn" ? <>আমার <span className="text-[#FBBF24]">দোকান</span></> : <>Amar <span className="text-[#FBBF24]">Dokan</span></>}</span>
        </Link>
        <div className="flex items-center gap-3">
          <div role="group" aria-label={t.language} className="flex rounded-full border border-[#3B5C88] bg-[#27466E] p-1">
            <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")} className={pill(lang === "bn")}>বাং</button>
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} className={`${pill(lang === "en")} font-[family-name:var(--font-inter)] text-sm`}>EN</button>
          </div>
          <button type="button" aria-label={t.menu} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}
            className="flex size-11 items-center justify-center rounded-xl border border-[#3B5C88] bg-[#27466E]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
          </button>
        </div>
      </div>
      {menu && (
        <>
          <button type="button" aria-label={t.menu} tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
          <nav aria-label={t.menu} onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
            className="absolute top-[70px] right-4 z-20 flex w-[260px] flex-col gap-0.5 rounded-[18px] border-[1.5px] border-border bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:right-8">
            {PAGES.map((p) => (
              <Link key={p.href} href={p.href} onClick={() => setMenu(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium text-text hover:bg-bg">
                <PageIcon page={p} size={20} />{t[p.key].title}
              </Link>
            ))}
            <div className="mx-1 my-1.5 h-px bg-border" />
            <button type="button" onClick={() => setLang(lang === "bn" ? "en" : "bn")} className="flex min-h-11 items-center justify-between rounded-xl px-3 font-medium text-text hover:bg-bg">
              {t.language}<span className="rounded-full bg-slate-100 px-2.5 text-[13px] font-semibold text-primary">বাংলা | EN</span>
            </button>
          </nav>
        </>
      )}
    </header>
  );
}

const FEATURE_ICONS = [
  { stroke: "#6D28D9", d: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></> },
  { stroke: "#DC2626", d: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M19 8v6" /><path d="M16 11h6" /></> },
  { stroke: "#D97706", d: <><path d="M12 3l9 16H3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></> },
  { stroke: "#16A34A", d: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 12h12l2-8H6" /></> },
];

export function Hero() {
  const { t } = useLanguage();
  return (
    <section className="relative overflow-hidden bg-primary">
      <HeroArt />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-5 px-4 pt-16 pb-14 text-center sm:px-8">
        <span className="rounded-full bg-[#FDE68A] px-3.5 py-1 text-[15px] font-semibold text-primary">{t.heroTag}</span>
        <h1 className="text-4xl leading-tight font-bold text-white sm:text-[60px] sm:leading-[1.2]">
          <span className="text-[#FBBF24]">{t.heroTitleHighlight}</span>{t.heroTitle.slice(t.heroTitleHighlight.length)}
        </h1>
        <p className="max-w-[640px] text-lg text-[#E2E8F0] sm:text-[21px]">{t.heroSubline}</p>
        <div className="mt-3 grid w-full max-w-[980px] grid-cols-2 gap-3.5 lg:grid-cols-4">
          {t.heroFeatures.map((f, i) => (
            <div key={f} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-bg px-4 py-4.5">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={FEATURE_ICONS[i].stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{FEATURE_ICONS[i].d}</svg>
              <span className="text-base font-semibold text-text">{f}</span>
            </div>
          ))}
        </div>
        <Link href="/entry" className="mt-4 inline-flex items-center gap-3 rounded-full bg-[#FBBF24] px-9 py-4 text-xl font-bold text-primary shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          <MicIcon size={24} stroke="#1F3A5F" />{t.entry.title}
        </Link>
      </div>
    </section>
  );
}

// Flat line art from the mockup (khata, receipt, calculator, coins). Decorative only.
function HeroArt() {
  return (
    <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
      <circle cx="40" cy="40" r="150" fill="#27466E" /><circle cx="1170" cy="400" r="170" fill="#27466E" />
      <g transform="rotate(-8 180 220)">
        <rect x="70" y="80" width="220" height="280" rx="14" fill="#F59E0B" /><rect x="70" y="80" width="34" height="280" rx="10" fill="#D97706" />
        <rect x="122" y="112" width="148" height="232" rx="6" fill="#FFF7E6" />
        {[148, 184, 220, 256, 292].map((y, i) => <line key={y} x1="136" y1={y} x2={[256, 256, 230, 256, 210][i]} y2={y} stroke="#F59E0B" strokeWidth="3" />)}
      </g>
      <g transform="rotate(10 290 330)">
        <rect x="240" y="270" width="96" height="120" rx="8" fill="#F472B6" />
        {[300, 322, 344].map((y, i) => <line key={y} x1="256" y1={y} x2={[320, 308, 320][i]} y2={y} stroke="#FFFFFF" strokeWidth="3" />)}
      </g>
      <g transform="rotate(9 1020 210)">
        <rect x="920" y="70" width="200" height="280" rx="22" fill="#14B8A6" /><rect x="944" y="96" width="152" height="58" rx="10" fill="#CCFBF1" />
        {[176, 224, 272].flatMap((y) => [944, 1000, 1056].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="40" height={x === 1056 && y === 272 ? 58 : 34} rx="8" fill={x === 1056 ? (y === 272 ? "#FB7185" : "#FDE68A") : "#FFFFFF"} />
        )))}
      </g>
      <circle cx="890" cy="330" r="30" fill="#FBBF24" /><circle cx="890" cy="330" r="18" fill="none" stroke="#D97706" strokeWidth="3" />
      <circle cx="850" cy="372" r="22" fill="#FDE68A" /><circle cx="350" cy="90" r="10" fill="#A78BFA" /><circle cx="860" cy="70" r="8" fill="#34D399" />
      <rect x="380" y="360" width="16" height="16" rx="3" fill="#60A5FA" transform="rotate(20 388 368)" />
      <rect x="1130" y="60" width="18" height="18" rx="4" fill="#F472B6" transform="rotate(-15 1139 69)" />
    </svg>
  );
}

function SectionHeading() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-3.5">
      <span className="flex size-[52px] flex-none items-center justify-center rounded-2xl bg-[#FEF3C7]">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>
      </span>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[32px] leading-tight font-bold text-primary">{t.home.weekTitle}</h2>
        <span className="block h-[5px] w-[72px] rounded-full bg-[#F59E0B]" />
        <span className="mt-1 text-[15px] text-muted">{t.home.weekSubtitle}</span>
      </div>
    </div>
  );
}

export function WeekStatusView({ data }: { data: HomeData | null }) {
  const { t, lang } = useLanguage();
  const h = t.home;
  const taka = (n: number) => formatTaka(n, lang);
  const range = data && new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "long", timeZone: "Asia/Dhaka" })
    .formatRange(new Date(data.weekStart), new Date(Date.parse(data.weekStart) + 6 * 864e5));

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 pt-12 pb-24 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading />
        {range && <span className="rounded-full border-[1.5px] border-border bg-white px-3.5 py-1.5 text-sm font-semibold text-primary">{h.sampleData} · {range}</span>}
      </div>

      {!data ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 font-semibold text-danger">{h.loadError}</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label={h.todaySales} value={taka(data.todaySales)} color="text-green-700" />
            <Stat label={h.todaySpend} value={taka(data.todaySpend)} color="text-slate-700" />
            <Stat label={h.totalDue} value={taka(data.totalDue)} color="text-danger" />
            <Stat label={h.lowStock} value={`${formatNumber(data.lowStock, lang)}${h.productsUnit}`} color="text-amber-700" href="/stock" />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <ProfitCard week={data.week} taka={taka} />
            <ActionsCard data={data} />
            <AuditCard />
          </div>
        </>
      )}
      <MenuTiles />
    </section>
  );
}

function Stat({ label, value, color, href }: { label: string; value: string; color: string; href?: string }) {
  const box = "flex flex-col gap-1 rounded-[20px] border-[1.5px] border-border bg-white p-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]";
  const inner = <><span className="text-sm text-muted">{label}</span><span className={`text-[28px] leading-tight font-bold ${color}`}>{value}</span></>;
  return href ? <Link href={href} className={`${box} hover:border-accent`}>{inner}</Link> : <div className={box}>{inner}</div>;
}

function ProfitCard({ week, taka }: { week: HomeData["week"]; taka: (n: number) => string }) {
  const { t, lang } = useLanguage();
  const h = t.home;
  const up = week.changePct != null && week.changePct >= 0;
  const max = Math.max(...week.daily, 1);
  return (
    <article className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-t-[6px] border-[#BBF7D0] border-t-success bg-white p-6 shadow-[0_10px_28px_rgba(22,163,74,0.10)]">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-600">{h.weeklyProfit}</h3>
        {week.changePct != null && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[15px] font-semibold ${up ? "bg-green-100 text-green-700" : "bg-red-100 text-danger"}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={up ? "" : "rotate-180"}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
            {formatNumber(Math.abs(week.changePct), lang)}%
          </span>
        )}
      </div>
      <div className="text-[40px] leading-[1.1] font-bold text-text">{taka(week.profit)}</div>
      <p className="text-[15px] text-muted">
        {week.changePct == null ? h.noComparison : `${h.lastWeek} ${taka(week.lastWeek)}${lang === "bn" ? "।" : "."}`} {h.sales} {taka(week.sales)} − {h.costOfSales} {taka(week.cost)}
      </p>
      <div className="mt-1 flex h-16 items-end gap-2" aria-hidden="true">
        {week.daily.map((v, i) => (
          <div key={i} className={`flex-1 rounded-md ${i === week.todayIndex ? "bg-success" : "bg-[#E2E8F0]"}`}
            style={{ height: i > week.todayIndex ? "4%" : `${Math.max(4, (v / max) * 100)}%` }} />
        ))}
      </div>
    </article>
  );
}

export function StatusFallback() {
  const { t } = useLanguage();
  // Skeleton, not words: the server renders this before the saved language is known.
  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-4 px-4 py-12 sm:px-8 lg:grid-cols-4" role="status">
      <span className="sr-only">{t.home.loading}</span>
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-border/60" />)}
    </div>
  );
}

export function FloatingMic() {
  const { t } = useLanguage();
  return (
    <Link href="/entry" aria-label={t.entry.title}
      className="fixed right-4 bottom-4 flex size-[68px] items-center justify-center rounded-full bg-accent shadow-[0_10px_28px_rgba(109,40,217,0.35)] sm:right-8 sm:bottom-8">
      <MicIcon size={30} stroke="#FFFFFF" />
    </Link>
  );
}
