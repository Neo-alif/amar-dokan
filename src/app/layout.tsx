import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { Hind_Siliguri, Inter } from "next/font/google";
import { dictionary, DEFAULT_LANG, LANG_COOKIE, langFrom } from "@/i18n/dictionary";
import { LanguageProvider } from "@/i18n/LanguageContext";
import "./globals.css";

// Hind Siliguri is not a variable font, so weights must be listed (400 body, 600 headings).
const hindSiliguri = Hind_Siliguri({
  variable: "--font-bangla",
  weight: ["400", "600"],
  subsets: ["bengali", "latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const t = dictionary[DEFAULT_LANG];

export const metadata: Metadata = {
  title: t.appName,
  description: t.heroTag,
  icons: { icon: "/amar-dokan-logo.svg" },
};

// Reads the language cookie (a request value, so it must sit inside <Suspense> with Cache Components).
async function LanguageFromCookie({ children }: { children: ReactNode }) {
  const lang = langFrom((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <>
      {lang !== DEFAULT_LANG && <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(lang)}` }} />}
      <LanguageProvider initialLang={lang}>{children}</LanguageProvider>
    </>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: only for <html>'s own lang, which the cookie script below may change before hydration
    <html
      lang={DEFAULT_LANG}
      suppressHydrationWarning
      className={`${inter.variable} ${hindSiliguri.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}><LanguageFromCookie>{children}</LanguageFromCookie></Suspense>
      </body>
    </html>
  );
}
