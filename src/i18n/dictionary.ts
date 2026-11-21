// All UI text lives here. Bangla (bn) is the default; English (en) is the P2 toggle.
// `en` is typed as `Dict`, so TypeScript errors if a key exists in one language but not the other.

const bn = {
  appName: "আমার দোকান",
  tagline: "আপনার ব্যবসা, এখন AI বোঝে।",
};

type Dict = typeof bn;

const en: Dict = {
  appName: "Amar Dokan",
  tagline: "Your Business, Understood by AI.",
};

export const dictionary = { bn, en };
export type Lang = keyof typeof dictionary;
export const DEFAULT_LANG: Lang = "bn";
