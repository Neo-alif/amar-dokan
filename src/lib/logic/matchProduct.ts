// Map a spoken name to an existing product/customer: exact (names + aliases) first,
// then a small typo tolerance. No match → treated as new (ConfirmCard shows "নতুন").
import { normalizeName, normalizePersonName } from "./normalize.ts";

export type Candidate = { id: string; names: string[] };

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]++;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

function bestMatch(query: string, candidates: Candidate[], norm: (s: string) => string): string | null {
  const q = norm(query);
  if (!q) return null;
  let best: { id: string; d: number } | null = null;
  let tie = false;
  for (const c of candidates) {
    for (const name of c.names) {
      const n = norm(name);
      if (n === q) return c.id;
      const d = levenshtein(q, n);
      const allowed = Math.min(n.length, q.length) <= 4 ? 1 : 2; // short words: only 1 typo
      if (d > allowed) continue;
      if (!best || d < best.d) { best = { id: c.id, d }; tie = false; }
      else if (d === best.d && best.id !== c.id) tie = true;
    }
  }
  return best && !tie ? best.id : null; // two different products equally close → don't guess
}

export const matchProduct = (spoken: string, products: Candidate[]) => bestMatch(spoken, products, normalizeName);
export const matchCustomer = (spoken: string, customers: Candidate[]) => bestMatch(spoken, customers, normalizePersonName);
