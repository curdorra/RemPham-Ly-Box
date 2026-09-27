import Link from "next/link";
import type { Me } from "@ott/shared";

export function Navbar({ me }: { me: Me | null }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-black/90 to-transparent">
      <nav className="flex items-center gap-6 px-4 py-4 sm:px-10">
        <Link href="/" className="text-xl font-black tracking-tight text-brand">
          RemPham<span className="text-white">Box</span>
        </Link>
        <div className="hidden gap-5 text-sm text-white/80 sm:flex">
          <Link href="/" className="hover:text-white">Home</Link>
          <Link href="/search?type=SERIES" className="hover:text-white">Series</Link>
          <Link href="/search?type=MOVIE" className="hover:text-white">Movies</Link>
          {me && <Link href="/my-list" className="hover:text-white">My List</Link>}
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/search" aria-label="Search" className="text-white/80 hover:text-white">
            Search
          </Link>
          {me ? (
            <Link href="/account" className="flex h-8 w-8 items-center justify-center rounded bg-brand font-bold">
              {me.name.slice(0, 1).toUpperCase()}
            </Link>
          ) : (
            <Link href="/login" className="rounded bg-brand px-3 py-1.5 font-semibold hover:bg-brand-hover">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
