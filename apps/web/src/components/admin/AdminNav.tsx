"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/titles", label: "Films & series" },
  { href: "/admin/screenings", label: "Opening nights" },
  { href: "/admin/snacks", label: "Kitchens & snacks" },
];

export function AdminNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === href : path.startsWith(href));
  return (
    <nav className="no-scrollbar -mx-[var(--gutter)] flex gap-2 overflow-x-auto px-[var(--gutter)]" aria-label="Staff">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active(l.href) ? "page" : undefined}
          className={`chip h-9 shrink-0 px-4 text-[13px] ${active(l.href) ? "chip-ox" : "hover:text-ink"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
