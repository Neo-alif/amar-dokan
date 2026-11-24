// Spoken unit → the product's own unit. The LLM copies the unit word; only this code converts.
// Container words (বোতল, প্যাকেট, টা) count the product's own unit and are never converted.
// Weight/volume words (লিটার, কেজি, গ্রাম) are converted with the pack size in the product's name.

const COUNT = ["pcs", "packet", "bottle"];
const MEASURE: Record<string, { dim: "kg" | "litre"; factor: number }> = {
  kg: { dim: "kg", factor: 1 }, g: { dim: "kg", factor: 0.001 },
  litre: { dim: "litre", factor: 1 }, ml: { dim: "litre", factor: 0.001 },
};
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const PACK_WORDS: [RegExp, string][] = [[/^(লিটার|লি|l|ltr|litre|liter)$/i, "litre"], [/^(মিলি|ml)$/i, "ml"], [/^(কেজি|kg)$/i, "kg"], [/^(গ্রাম|g|gm)$/i, "g"]];

// "সয়াবিন তেল ২ লিটার" / "Soybean oil 2L" / "Atta 500g" → pack size in kg or litre
export function packSize(name: string): { dim: "kg" | "litre"; size: number } | null {
  const s = name.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  const m = s.match(/(\d+(?:\.\d+)?)\s*([a-zঀ-৿.]+)/i);
  const word = m && PACK_WORDS.find(([re]) => re.test(m[2].replace(/\.$/, "")));
  if (!m || !word) return null;
  const u = MEASURE[word[1]];
  return { dim: u.dim, size: Number(m[1]) * u.factor };
}

const CONTAINER_UNIT: Record<string, string> = {
  বোতল: "bottle", botol: "bottle", bottle: "bottle", প্যাকেট: "packet", packet: "packet",
  পিস: "pcs", pis: "pcs", pcs: "pcs", টা: "pcs", টি: "pcs", ta: "pcs", ti: "pcs",
};
const CONTAINER_WORDS = Object.keys(CONTAINER_UNIT).join("|");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Guard against the LLM copying a pack size ("২ লিটার" in the name) as the unit: a count + container word
// next to the product in the owner's text wins. "2 বোতল সয়াবিন তেল" / "সয়াবিন তেল 2 বোতল" → 2 bottle.
// input is normalizeInput()'d (ASCII digits).
export function saidContainer(input: string, names: string[]): { quantity: number; unit: string } | null {
  const text = input.toLowerCase();
  const count = `(\\d+(?:\\.\\d+)?)\\s*(${CONTAINER_WORDS})(?=[\\s,।]|$)`; // "টাকা" is not "টা"
  for (const name of names.filter(Boolean).map((n) => esc(n.toLowerCase()))) {
    const m = text.match(new RegExp(`${count}\\s*${name}`)) ?? text.match(new RegExp(`${name}\\s*${count}`));
    if (m) return { quantity: Number(m[1]), unit: CONTAINER_UNIT[m[2]] };
  }
  return null;
}

export type Resolved = { quantity: number | null; unit: string; scale: number; ask_count: "bottle" | "packet" | null };

// scale = spoken units in one product unit: quantity ÷ scale, a said per-unit price × scale.
// null → leave as said (the card's "এক X-এ কত Y?" question handles it).
export function resolveUnit(quantity: number | null, said: string | null, product: { unit: string; names: string[] }): Resolved | null {
  if (quantity == null || !said || said === product.unit) return null;
  if (COUNT.includes(said) && COUNT.includes(product.unit)) return { quantity, unit: product.unit, scale: 1, ask_count: null };
  const m = MEASURE[said];
  if (!m) return null;
  const loose = MEASURE[product.unit];
  if (loose) {
    if (loose.dim !== m.dim) return null;
    const scale = loose.factor / m.factor; // 1 kg = 1000 g
    return { quantity: quantity / scale, unit: product.unit, scale, ask_count: null };
  }
  if (!COUNT.includes(product.unit)) return null;
  const pack = product.names.map(packSize).find((p) => p?.dim === m.dim);
  if (!pack) return null;
  const scale = pack.size / m.factor; // spoken units in one pack
  const n = Math.round((quantity / scale) * 1e6) / 1e6;
  const ask_count = pack.dim === "litre" ? "bottle" : "packet";
  return Number.isInteger(n) ? { quantity: n, unit: product.unit, scale, ask_count: null } : { quantity: null, unit: product.unit, scale, ask_count };
}
