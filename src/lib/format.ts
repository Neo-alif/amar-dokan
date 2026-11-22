import type { Lang } from "@/i18n/dictionary";

const locale = (lang: Lang) => (lang === "bn" ? "bn-BD" : "en-IN"); // both group as 1,68,400

export const formatNumber = (n: number, lang: Lang) =>
  new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2 }).format(n);

export const formatTaka = (n: number, lang: Lang) => `৳ ${formatNumber(n, lang)}`;
