"use client";

import Link from "next/link";
import { useState } from "react";
import type { CatalogRow } from "@ott/shared";
import { formatInr } from "@/lib/format";

/** "Stories for tonight": five cards, the hovered one widens and shows a paper panel; its art blurs behind. */
export function Reel({ row }: { row: CatalogRow }) {
  const titles = row.titles.slice(0, 5);
  const [f, setF] = useState(0);
  const focused = titles[f];
  if (!focused) return null;

  return (
    <section className="relative overflow-hidden py-12" aria-label={row.label}>
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={focused.backdropUrl} alt="" className="h-full w-full scale-110 object-cover blur-[28px] transition-[opacity] duration-[400ms]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#2f373a_0%,rgba(47,55,58,.6)_22%,rgba(47,55,58,.55)_70%,rgba(47,55,58,.95)_100%)]" />
      </div>
      <div className="gutter relative">
        <h2 className="headline text-[26px] sm:text-[34px]">{row.label}</h2>
        <div className="no-scrollbar mt-9 flex gap-1.5 overflow-x-auto pb-3">
          {titles.map((title, k) => {
            const on = k === f;
            return (
              <Link
                key={title.id}
                href={`/title/${title.slug}`}
                onMouseEnter={() => setF(k)}
                onFocus={() => setF(k)}
                onClick={(e) => {
                  // touch: first tap focuses, second opens
                  if (!on && window.matchMedia("(hover: none)").matches) {
                    e.preventDefault();
                    setF(k);
                  }
                }}
                className={`relative h-[300px] shrink-0 overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,.35)] transition-[width] duration-[350ms] ease-[var(--ease)] sm:h-[420px] ${on ? "w-[210px] sm:w-[280px]" : "w-[130px] sm:w-[180px]"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={title.posterUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                {on ? (
                  <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-paper p-4 text-[#1f2629] sm:h-[190px] sm:p-5">
                    <b className="font-cond text-[19px] leading-tight font-medium tracking-[.2em] uppercase sm:text-[22px]">{title.name}</b>
                    <span className="text-[13px] text-[#5a6468]">{title.year} · {title.genres[0]?.name ?? (title.type === "SERIES" ? "Series" : "Film")} · {formatInr(title.pricePaise)}</span>
                    <span className="mt-auto w-fit border border-current px-3.5 py-[7px] text-[11px] font-semibold tracking-[.16em] uppercase">Open</span>
                  </span>
                ) : (
                  <span className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-[rgba(31,38,41,.92)] to-transparent px-2 pt-16 pb-5 text-center">
                    <b className="font-cond text-[16px] font-medium tracking-[.2em] uppercase sm:text-[19px]">{title.name}</b>
                    <span className="text-[12px] text-ink-2">{title.year} · {title.type === "SERIES" ? "Series" : "Film"}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <p className="mt-4 flex items-center justify-between text-[12px] font-semibold tracking-[.16em] text-ink-2 uppercase">
          <span>↵ Open</span>
          <span>{String(f + 1).padStart(2, "0")} / {String(titles.length).padStart(2, "0")}</span>
        </p>
      </div>
    </section>
  );
}
