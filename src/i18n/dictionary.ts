// All UI text lives here. Bangla (bn) is the default; English (en) is the P2 toggle.
// `en` is typed as `Dict`, so TypeScript errors if a key exists in one language but not the other.

const bn = {
  appName: "আমার দোকান",
  // Hero copy from the approved mockup (docs/mockup/Main.dc.html)
  heroTag: "আপনার দোকানের এআই হিসাবরক্ষক",
  heroTitle: "আমার দোকানে সব হিসাব",
};

type Dict = typeof bn;

const en: Dict = {
  appName: "Amar Dokan",
  heroTag: "Your shop's AI bookkeeper",
  heroTitle: "Every account of your shop, in one place",
};

export const dictionary = { bn, en };
export type Lang = keyof typeof dictionary;
export const DEFAULT_LANG: Lang = "bn";
