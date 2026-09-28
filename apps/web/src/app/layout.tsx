import type { Metadata } from "next";
import { Cormorant_Garamond, Inter_Tight } from "next/font/google";
import { Header } from "@/components/Header";
import { LangProvider } from "@/components/LangProvider";
import { Logo } from "@/components/Logo";
import { getMe, getTickets } from "@/lib/api-server";
import { getLang } from "@/lib/lang-server";
import { translator } from "@/lib/i18n";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
});
const interTight = Inter_Tight({ subsets: ["latin", "latin-ext"], variable: "--font-inter-tight" });

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
    <html lang={lang === "lus" ? "lus" : "en"} className={`${cormorant.variable} ${interTight.variable}`}>
      <body className="min-h-screen">
        <LangProvider lang={lang}>
          <div className="grain" aria-hidden="true" />
          <Header me={me} lang={lang} ticketCount={usable} />
          <main>{children}</main>
          <footer className="gutter mt-28 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] py-10 text-sm text-ink-3">
            <Logo tagline={t("tagline")} />
            <p>RemPhamLy Cinema · Aizawl, Mizoram · © {new Date().getFullYear()}</p>
          </footer>
        </LangProvider>
      </body>
    </html>
  );
}
