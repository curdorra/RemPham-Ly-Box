"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TitleSummary } from "@ott/shared";
import { formatDuration, formatInr, formatShowtime, maturityLabel } from "@/lib/format";
import { useT } from "./LangProvider";
import { StreamVideo } from "./StreamVideo";

export interface HeroSlide {
  title: TitleSummary;
  /** Set when the slide is an upcoming opening night. */
  opening?: { screeningId: string; startsAt: string };
  owned?: boolean;
}

const ROTATE_MS = 15000;

/** Full-bleed key-art hero that rotates through a few films. */
export function Hero({ slides }: { slides: HeroSlide[] }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [fading, setFading] = useState(false);
  const [sound, setSound] = useState(false);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => {
      setFading(true);
      setTimeout(() => {
        setI(((next % slides.length) + slides.length) % slides.length);
        setFading(false);
      }, 450);
    },
    [slides.length],
  );

  useEffect(() => {
    if (paused || sound || slides.length < 2) return;
    const id = setTimeout(() => go(i + 1), ROTATE_MS);
    return () => clearTimeout(id);
  }, [i, paused, sound, go, slides.length]);

  const slide = slides[i];
  if (!slide) return null;
  const { title } = slide;
  const [kicker, name] = title.name.includes(": ") ? title.name.split(": ", 2) : [title.genres[0]?.name ?? "", title.name];
  const meta = [
    String(title.year),
    title.type === "MOVIE" && title.durationSec ? formatDuration(title.durationSec) : t("episodes"),
    title.genres.slice(0, 2).map((g) => g.name).join(" · "),
    title.language,
  ].filter(Boolean);

  const stats = [
    ["Runtime", title.type === "MOVIE" && title.durationSec ? formatDuration(title.durationSec) : t("episodes")],
    ["Rated", maturityLabel(title.maturity)],
    title.language ? ["Language", title.language] : null,
  ].filter(Boolean) as string[][];

  return (
    <section
      className="relative h-[100svh] min-h-[680px] overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label={t("nowShowing")}
    >
      <div className="absolute inset-0">
        {title.trailerUrl ? (
          <StreamVideo key={title.id} src={title.trailerUrl} muted={!sound} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={title.id} src={title.backdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {/* overlays keep white text above 4.5:1 */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(40,48,52,.78)_0%,rgba(40,48,52,.2)_55%,rgba(40,48,52,.35)_100%),linear-gradient(0deg,#2f373a_0%,rgba(47,55,58,0)_35%)] max-lg:bg-[linear-gradient(0deg,#2f373a_6%,rgba(40,48,52,.85)_45%,rgba(40,48,52,.25)_80%)]" />
        <div className={`absolute inset-0 bg-bg transition-opacity duration-[400ms] ${fading ? "opacity-100" : "opacity-0"}`} />
      </div>

      {slides.length > 1 && (
        <>
          <button onClick={() => go(i - 1)} aria-label="Previous" className="icon-btn absolute top-1/2 left-6 z-20 h-12 w-12 -translate-y-1/2 bg-[rgba(30,36,39,.75)] text-2xl hover:bg-[rgba(30,36,39,.95)] max-lg:hidden">‹</button>
          <button onClick={() => go(i + 1)} aria-label="Next" className="icon-btn absolute top-1/2 right-6 z-20 h-12 w-12 -translate-y-1/2 bg-[rgba(30,36,39,.75)] text-2xl hover:bg-[rgba(30,36,39,.95)] max-lg:hidden">›</button>
        </>
      )}

      <div className="gutter absolute inset-0 z-10 flex items-end pb-[170px] max-lg:pb-[150px]">
        <div className={`flex w-full items-end justify-between gap-12 transition-all duration-500 ${fading ? "translate-y-3 opacity-0" : "opacity-100"}`}>
          <div className="max-w-[540px]">
            <div className="eyebrow">
              {slide.opening && <span className="live-dot" />}
              <span>
                {slide.opening
                  ? `${t("openingNight")} · ${formatShowtime(slide.opening.startsAt)}`
                  : [title.type === "SERIES" ? "Series" : "Film", title.genres.slice(0, 2).map((g) => g.name).join(", "), title.year].filter(Boolean).join(" · ")}
              </span>
            </div>
            <h1 className="display mt-5 text-[clamp(36px,5.2vw,60px)]">{title.name}</h1>
            <p className="mt-5 line-clamp-3 max-w-[400px] text-[15px] leading-[1.6] text-ink/85">{title.synopsis}</p>
            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
              {slide.opening ? (
                <Link href={`/opening/${slide.opening.screeningId}`} className="btn btn-red">{t("prebook")} · {formatInr(title.pricePaise)}</Link>
              ) : slide.owned ? (
                <Link href={`/watch/${title.id}`} className="btn btn-red">▶ {t("watch")}</Link>
              ) : (
                <Link href={`/title/${title.slug}?book=1`} className="btn btn-red">{t("book")} · {formatInr(title.pricePaise)}</Link>
              )}
              <Link href={`/title/${title.slug}`} className="group flex items-center gap-3 text-[12px] font-semibold tracking-[.16em] uppercase">
                {t("moreInfo")}
                <span className="grid h-[26px] w-[26px] place-items-center rounded-full text-base shadow-[inset_0_0_0_1.5px_var(--line-2)] transition group-hover:shadow-[inset_0_0_0_1.5px_var(--color-ink)]">›</span>
              </Link>
              {title.trailerUrl && (
                <button className="icon-btn btn-ghost h-10 w-10" aria-label="Sound" onClick={() => setSound((s) => !s)}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
                    {sound ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />}
                  </svg>
                </button>
              )}
            </div>
          </div>
          <dl className="flex gap-12 pb-1 max-lg:hidden">
            {stats.map(([k, v]) => (
              <div key={k}>
                <dt className="lbl text-[10px] text-ink-2">{k}</dt>
                <dd className="mt-1.5 text-[20px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {slides.length > 1 && (
        <nav
          className="no-scrollbar gutter absolute inset-x-0 bottom-0 z-10 grid grid-cols-4 gap-5 pb-8 max-lg:grid-cols-[repeat(4,200px)] max-lg:overflow-x-auto"
          aria-label="Films"
        >
          {slides.slice(0, 4).map((s, k) => (
            <button key={s.title.id} onClick={() => go(k)} aria-current={k === i} className={`group text-left transition-opacity ${k === i ? "opacity-100" : "opacity-60 hover:opacity-100"}`}>
              <span className="relative block h-0.5 bg-ink/35">
                <span className={`absolute inset-y-0 left-0 bg-ink ${k === i ? "" : "w-0"}`} style={k === i && !paused && !sound ? { animation: `fill ${ROTATE_MS}ms linear forwards`, width: 0 } : k === i ? { width: "100%" } : undefined} />
              </span>
              <span className="mt-3 block truncate font-serif text-[15px]">{s.title.name}</span>
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}
