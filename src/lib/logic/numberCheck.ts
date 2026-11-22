// Number check for AI text (TRD §6): every number the LLM writes must exist in the facts it was given.
// If one doesn't, the caller shows a template from real data instead (clearly labelled, not AI).

// Numbers written in a text: Bangla digits → ASCII, "1,68,400" → 168400, "18.5" stays 18.5.
export function numbersIn(text: string): number[] {
  const ascii = text.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/(\d),(?=\d)/g, "$1");
  return (ascii.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

// Every number in the facts (plus its rounded value, list lengths like "3 products", digits inside names).
export function allowedNumbers(facts: unknown, out = new Set<number>()): Set<number> {
  if (typeof facts === "number") { out.add(Math.abs(facts)); out.add(Math.round(Math.abs(facts))); }
  else if (typeof facts === "string") numbersIn(facts).forEach((n) => out.add(n)); // e.g. "Soybean oil 2L"
  else if (Array.isArray(facts)) { out.add(facts.length); facts.forEach((f) => allowedNumbers(f, out)); }
  else if (facts && typeof facts === "object") Object.values(facts).forEach((f) => allowedNumbers(f, out));
  return out;
}

export const numbersOk = (text: string, allowed: Set<number>) => numbersIn(text).every((n) => allowed.has(n));
