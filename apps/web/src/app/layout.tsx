import type { Metadata } from "next";
import { Archivo, Barlow, Barlow_Condensed, Source_Serif_4 } from "next/font/google";
import { Header } from "@/components/Header";
import { LangProvider } from "@/components/LangProvider";
import { Logo } from "@/components/Logo";
import { getMe, getTickets } from "@/lib/api-server";
import { getLang } from "@/lib/lang-server";
import { translator } from "@/lib/i18n";
import "./globals.css";

// Source Serif 4 carries titles, Barlow the UI, Barlow Condensed section heads, Archivo (wide) the wordmark.
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-source-serif" });
const barlow = Barlow({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-barlow" });
const barlowCond = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["300", "400", "500", "600"], variable: "--font-barlow-cond" });
const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], weight: "variable", variable: "--font-archivo" });

export const metadata: Metadata = {
  title: { default: "RemPham Ly Box — Online Cinema", template: "%s · RemPham Ly Box" },
  description: "Mizo films on the big screen and at home: tickets, opening nights and snacks.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, lang] = await Promise.all([getMe().catch(() => null), getLang()]);
  const tickets = me ? await getTickets().catch(() => []) : [];
  const usable = tickets.filter((x) => !x.isGiftForOthers && x.state !== "EXPIRED").length;
  const t = translator(lang);
  return (
    <html lang={lang === "lus" ? "lus" : "en"} className={`${sourceSerif.variable} ${barlow.variable} ${barlowCond.variable} ${archivo.variable}`}>
      <body className="min-h-screen">
        <LangProvider lang={lang}>
          <Header me={me} lang={lang} ticketCount={usable} />
          <main>{children}</main>
          <footer className="gutter mt-28 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] py-10 text-sm text-ink-3">
            <Logo />
            <p className="tracking-[.04em]">{t("tagline")} · RemPhamLy Cinema · Aizawl, Mizoram · © {new Date().getFullYear()}</p>
          </footer>
        </LangProvider>
      </body>
    </html>
  );
}
