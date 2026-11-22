"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageContext";

// Navy bar used by every inner page (mockup: back-to-home + amber page title).
export function PageHeader({ title }: { title: string }) {
  const { t } = useLanguage();
  return (
    <header className="bg-primary border-b border-[#27466E]">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
        <Link href="/" className="flex min-h-12 items-center gap-2.5 text-white hover:text-[#FBBF24]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          <span className="text-lg font-semibold">{t.backHome}</span>
        </Link>
        <h1 className="text-[22px] font-bold text-[#FBBF24]">{title}</h1>
        <span className="hidden w-[120px] sm:block" />
      </div>
    </header>
  );
}
