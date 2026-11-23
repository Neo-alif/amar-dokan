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

// Number words a shop owner says (Bangla + Banglish). "দুইশ"/"dui sho" = 200, "পাঁচ হাজার" = 5000.
// shortcut: common words only (1-10, round tens, দেড়/আড়াই, শ/হাজার); extend if the test set shows misses.
const WORDS: Record<string, number> = Object.fromEntries(Object.entries({
  "এক": 1, "দুই": 2, "দু": 2, "তিন": 3, "চার": 4, "পাঁচ": 5, "ছয়": 6, "সাত": 7, "আট": 8, "নয়": 9, "দশ": 10,
  "বিশ": 20, "ত্রিশ": 30, "চল্লিশ": 40, "পঞ্চাশ": 50, "ষাট": 60, "সত্তর": 70, "আশি": 80, "নব্বই": 90, "দেড়": 1.5, "আড়াই": 2.5,
  ek: 1, dui: 2, du: 2, tin: 3, char: 4, pach: 5, panch: 5, choy: 6, chhoy: 6, sat: 7, aat: 8, noy: 9, dosh: 10, dos: 10,
  bish: 20, tirish: 30, chollish: 40, ponchash: 50, pochash: 50, pachas: 50, sottor: 70, ashi: 80, nobboi: 90, der: 1.5, arai: 2.5,
}).map(([k, v]) => [k.normalize("NFC"), v])); // NFC: য়/ড় have two Unicode spellings
const HUNDRED = /^(শ|শো|শত|sho|so|shoto)$/;
const THOUSAND = /^(হাজার|hajar|hazar)$/;
const BN_HUNDRED_SUFFIX = /(শো|শত|শ)$/;

export function saidNumbers(text: string): Set<number> {
  const out = new Set(numbersIn(text));
  const tokens = text.normalize("NFC").toLowerCase().split(/[^\p{L}\p{M}0-9০-৯.]+/u).filter(Boolean);
  tokens.forEach((tok, i) => {
    let n = WORDS[tok] ?? Number(numbersIn(tok)[0] ?? NaN);
    if (Number.isNaN(n)) {
      const stem = tok.replace(BN_HUNDRED_SUFFIX, ""); // দুইশ, দেড়শো
      if (stem !== tok && WORDS[stem] != null) n = (WORDS[stem] ?? 1) * 100;
      else if (HUNDRED.test(tok)) n = 100;
      else return;
    }
    const next = tokens[i + 1] ?? "";
    if (HUNDRED.test(next)) n *= 100;
    else if (THOUSAND.test(next)) n *= 1000;
    out.add(n);
  });
  return out;
}
