"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { dictionary, LANG_COOKIE, type Lang } from "./dictionary";

// The language lives in a cookie: the root layout reads it on the server and passes it in,
// so server HTML and the first client render match (no hydration mismatch in English).
type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (typeof dictionary)[Lang];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState(initialLang);

  function setLang(next: Lang) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`; // 1 year
    document.documentElement.lang = next;
    setLangState(next);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: dictionary[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
