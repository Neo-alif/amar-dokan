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
