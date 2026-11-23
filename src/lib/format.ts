import type { Lang } from "@/i18n/dictionary";

const locale = (lang: Lang) => (lang === "bn" ? "bn-BD" : "en-IN"); // both group as 1,68,400

export const formatNumber = (n: number, lang: Lang) =>
  new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2 }).format(n);

export const formatTaka = (n: number, lang: Lang) => `৳ ${formatNumber(n, lang)}`;

// Display name of the model that wrote an AI text, e.g. "gemini-3.5-flash-lite" → "Gemini 3.5 Flash-Lite".
const MODEL_NAMES: Record<string, string> = {
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite",
  "qwen/qwen3.8-27b": "Qwen3.8 27B",
  "openai/gpt-oss-120b": "GPT-OSS 120B",
  "openai/gpt-oss-20b": "GPT-OSS 20B",
};
export const modelName = (id: string) => MODEL_NAMES[id] ?? id; // unknown (env-configured) model: show its id

// "২৪ নভে, রাত ১:১৫" / "24 Nov, 1:15 am", always Asia/Dhaka (UTC+6, no DST).
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bnPeriod = (h: number) => (h < 4 ? "রাত" : h < 6 ? "ভোর" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকাল" : h < 20 ? "সন্ধ্যা" : "রাত");
export function formatDateTime(iso: string, lang: Lang) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" }).format(d);
  const local = new Date(d.getTime() + 6 * 3600 * 1000);
  const h = local.getUTCHours(), time = `${h % 12 || 12}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  return lang === "bn"
    ? `${day}, ${bnPeriod(h)} ${time.replace(/\d/g, (x) => BN_DIGITS[Number(x)])}`
    : `${day}, ${time} ${h < 12 ? "am" : "pm"}`;
}
