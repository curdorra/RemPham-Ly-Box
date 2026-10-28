import type { Metadata } from "next";
import { Archivo, Newsreader } from "next/font/google";
import { Header } from "@/components/Header";
import { LangProvider } from "@/components/LangProvider";
import { Logo } from "@/components/Logo";
import { getMe, getTickets } from "@/lib/api-server";
import { getLang } from "@/lib/lang-server";
import "./globals.css";

// Two families: Newsreader (optical sizes) carries titles; Archivo carries the UI, and its width axis
// gives the condensed section heads and the wide wordmark.
const newsreader = Newsreader({ subsets: ["latin", "latin-ext"], axes: ["opsz"], weight: "variable", variable: "--font-newsreader" });
const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], weight: "variable", variable: "--font-archivo" });

export const metadata: Metadata = {
  title: { default: "RemPham Ly Box", template: "%s · RemPham Ly Box" },
  description: "Mizo films on the big screen and at home: tickets, opening nights and snacks.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, lang] = await Promise.all([getMe().catch(() => null), getLang()]);
  const tickets = me ? await getTickets().catch(() => []) : [];
  const usable = tickets.filter((x) => !x.isGiftForOthers && x.state !== "EXPIRED").length;
  return (
    <html lang="en" className={`${newsreader.variable} ${archivo.variable}`}>
      <body className="min-h-screen">
        <LangProvider lang={lang}>
          <Header me={me} ticketCount={usable} />
          <main>{children}</main>
          <footer className="gutter mt-28 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] py-10 text-sm text-ink-3">
            <Logo />
            <p className="tracking-[.04em]">RemPhamLy Cinema · Aizawl, Mizoram · © {new Date().getFullYear()}</p>
          </footer>
        </LangProvider>
      </body>
    </html>
  );
}
