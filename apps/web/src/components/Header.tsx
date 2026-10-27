"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Me, Suggestion } from "@ott/shared";
import { api } from "@/lib/api-client";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import { useT } from "./LangProvider";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";

const NAV = [
  ["/", "navHome"],
  ["/opening", "navOpening"],
  ["/cinema", "navCinema"],
  ["/snacks", "navSnacks"],
  ["/box-office", "navBoxOffice"],
] as const;

function SearchBox({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      return;
    }
    const id = setTimeout(() => {
      api<Suggestion[]>(`/search/suggest?q=${encodeURIComponent(q)}`).then(setItems).catch(() => setItems([]));
    }, 150);
    return () => clearTimeout(id);
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    onDone?.();
    router.push(href);
  };

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("search")}
        className="h-10 w-full rounded-full bg-[var(--gold-soft)] pl-10 pr-4 text-sm outline-none placeholder:text-ink-3 focus:bg-[rgba(243,244,242,.16)] lg:w-60"
      />
      <svg className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4-4" />
      </svg>
      {open && items.length > 0 && (
        <ul className="panel absolute top-12 right-0 left-0 z-50 overflow-hidden bg-[rgba(31,38,41,.92)] p-1 shadow-2xl lg:w-80">
          {items.map((s) => (
            <li key={`${s.kind}:${s.text}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(s.kind === "title" && s.slug ? `/title/${s.slug}` : `/search?q=${encodeURIComponent(s.text)}`)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--gold-soft)]"
              >
                <span className={s.kind === "title" ? "font-semibold" : ""}>{s.text}</span>
                <span className="lbl text-[10px] text-ink-3">{s.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

export function Header({ me, lang, ticketCount }: { me: Me | null; lang: Lang; ticketCount: number }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [solid, setSolid] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const setLang = (l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  const switchProfile = async (profileId: string) => {
    await api("/profiles/current", { method: "PUT", body: { profileId } });
    setMenu(false);
    router.refresh();
  };
  const signOut = async () => {
    await api("/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };
  if (pathname.startsWith("/watch")) return null;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background,box-shadow] duration-300 ${
        solid ? "bg-[rgba(40,47,51,.86)] shadow-[0_1px_0_var(--line)] backdrop-blur-xl" : "bg-gradient-to-b from-[rgba(40,48,52,.7)] to-transparent"
      }`}
    >
      <div className="gutter flex h-[72px] items-center gap-6">
        <Logo />
        <nav className="hidden flex-1 justify-center gap-1 lg:flex">
          {NAV.map(([href, key]) => (
            <Link
              key={href}
              href={href}
              className={`border-b-[1.5px] px-3.5 py-1 text-[12px] font-semibold tracking-[.16em] uppercase transition-colors hover:text-ink ${
                (href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "border-ink text-ink" : "border-transparent text-ink-2"
              }`}
            >
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <div className="hidden lg:block">
            <SearchBox />
          </div>
          <button className="icon-btn h-10 w-10 lg:hidden" aria-label={t("search")} onClick={() => setMobileSearch((v) => !v)}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20 20l-4-4" />
            </svg>
          </button>
          <div className="seg hidden sm:flex" role="group" aria-label="Language">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button aria-pressed={lang === "lus"} onClick={() => setLang("lus")}>MIZO</button>
          </div>
          {me ? (
            <>
              <Link href="/account" className="relative hidden h-10 items-center gap-2 rounded-full px-4 text-[11.5px] font-semibold tracking-[.16em] uppercase shadow-[inset_0_0_0_1.5px_var(--line-2)] sm:inline-flex">
                {t("myTickets")}
                {ticketCount > 0 && <b className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 text-[11px] text-[#20272a]">{ticketCount}</b>}
              </Link>
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenu((m) => !m)} aria-label="Profiles" aria-expanded={menu}>
                  <Avatar profile={me.profile} size={34} />
                </button>
                {menu && (
                  <div className="panel absolute top-12 right-0 z-50 w-60 bg-[rgba(31,38,41,.92)] p-2 shadow-2xl">
                    {me.profiles.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => switchProfile(p.id)}
                        className="flex w-full items-center gap-3 px-2 py-2 text-left hover:bg-[var(--gold-soft)]"
                      >
                        <Avatar profile={p} size={30} />
                        <span className="flex-1 truncate">{p.name}</span>
                        {p.id === me.profile.id && <span className="text-gold">✓</span>}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-[var(--line)]" />
                    <Link href="/profiles" onClick={() => setMenu(false)} className="block px-2 py-2 text-sm hover:bg-[var(--gold-soft)]">{t("manageProfiles")}</Link>
                    <Link href="/account" onClick={() => setMenu(false)} className="block px-2 py-2 text-sm hover:bg-[var(--gold-soft)]">{t("myTickets")}</Link>
                    <Link href="/my-list" onClick={() => setMenu(false)} className="block px-2 py-2 text-sm hover:bg-[var(--gold-soft)]">{t("myList")}</Link>
                    {me.role === "ADMIN" && <Link href="/admin" onClick={() => setMenu(false)} className="block px-2 py-2 text-sm hover:bg-[var(--gold-soft)]">Staff</Link>}
                    <div className="my-1 h-px bg-[var(--line)]" />
                    <div className="seg mx-2 my-2 sm:hidden" role="group" aria-label="Language">
                      <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
                      <button aria-pressed={lang === "lus"} onClick={() => setLang("lus")}>MIZO</button>
                    </div>
                    <button onClick={signOut} className="block w-full px-2 py-2 text-left text-sm text-ink-2 hover:bg-[var(--gold-soft)]">{t("signOut")}</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link href="/login" className="btn btn-red btn-sm">{t("signIn")}</Link>
          )}
        </div>
      </div>
      {mobileSearch && (
        <div className="gutter pb-3 lg:hidden">
          <SearchBox onDone={() => setMobileSearch(false)} />
        </div>
      )}
      <nav className="gutter no-scrollbar flex gap-1 overflow-x-auto pb-2 lg:hidden">
        {NAV.map(([href, key]) => (
          <Link key={href} href={href} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold tracking-[.14em] uppercase ${(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "bg-[rgba(243,244,242,.18)] text-ink" : "text-ink-2"}`}>
            {t(key)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
