// Text clean-up before the LLM and for name matching. Pure functions, no AI.

export const MAX_INPUT_CHARS = 500;

// shortcut: only digits + spacing here; number words (দুই, dui) and unit spellings are left to the LLM.
// Upgrade if the test set shows the LLM missing them.
export function normalizeInput(text: string): string {
  return text
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6)) // Bangla digits → 0-9
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INPUT_CHARS);
}

const HONORIFICS = /(^|\s)(ভাই|ভাইয়া|আপা|ভাবি|মামা|চাচা|খালা|bhai|vai|bhaiya|vaiya|apa|bhabi|vabi|mama|chacha|khala)(?=\s|$)/g;

export function normalizeName(name: string): string {
  return name.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

// "রহিম ভাই" / "Rahim vai" → "রহিম" / "rahim"
export function normalizePersonName(name: string): string {
  return normalizeName(name).replace(HONORIFICS, " ").replace(/\s+/g, " ").trim();
}
