import type { Metadata } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import { dictionary, DEFAULT_LANG } from "@/i18n/dictionary";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={DEFAULT_LANG}
      className={`${inter.variable} ${hindSiliguri.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
