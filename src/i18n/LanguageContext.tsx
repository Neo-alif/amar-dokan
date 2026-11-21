"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LANG, dictionary, type Lang } from "./dictionary";

const STORAGE_KEY = "amar-dokan-lang";

// The saved language lives outside React (localStorage), so we read it with
// useSyncExternalStore: the server snapshot is always the default (no hydration mismatch),
// and the client reads the saved choice.
const listeners = new Set<() => void>();
let unsavedLang: Lang | null = null; // used only when localStorage is blocked (private mode)

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // another tab changed the language
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readLang(): Lang {
  if (unsavedLang) return unsavedLang;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "bn" || saved === "en") return saved;
  } catch {
    // localStorage blocked: fall through to the default.
  }
  return DEFAULT_LANG;
}

function setLang(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
    unsavedLang = null;
  } catch {
    unsavedLang = next; // not remembered, but still applies for this visit
  }
  listeners.forEach((notify) => notify());
}

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (typeof dictionary)[Lang];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => DEFAULT_LANG);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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
