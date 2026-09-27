import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { getMe } from "@/lib/api-server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RemPham Ly Box", template: "%s · RemPham Ly Box" },
  description: "Movies and series, streaming anywhere.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe().catch(() => null);
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Navbar me={me} />
        <main>{children}</main>
        <footer className="mt-24 border-t border-white/5 px-4 py-10 text-sm text-muted sm:px-10">
          © {new Date().getFullYear()} RemPham Ly Box. Demo content: Blender Foundation open movies (CC-BY).
        </footer>
      </body>
    </html>
  );
}
