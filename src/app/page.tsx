"use client";

import { useLanguage } from "@/i18n/LanguageContext";

export default function Home() {
  const { t } = useLanguage();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-lg text-muted">{t.heroTag}</p>
      <h1 className="text-4xl font-semibold text-primary">{t.heroTitle}</h1>
    </main>
  );
}
