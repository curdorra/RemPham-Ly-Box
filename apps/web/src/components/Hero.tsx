"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TitleSummary } from "@ott/shared";
import { formatDuration, formatInr, formatShowtime, ROMAN } from "@/lib/format";
import { useT } from "./LangProvider";
import { StreamVideo } from "./StreamVideo";

export interface HeroSlide {
  title: TitleSummary;
  /** Set when the slide is an upcoming opening night. */
  opening?: { screeningId: string; startsAt: string };
  owned?: boolean;
}

const ROTATE_MS = 15000;

/** Full-bleed, red-graded hero that rotates through a few films. */
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

  return (
    <section
      className="relative h-[100svh] min-h-[640px] overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label={t("nowShowing")}
    >
      <div className="absolute inset-0">
        {title.trailerUrl ? (
          <StreamVideo key={title.id} src={title.trailerUrl} muted={!sound} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={title.id} src={title.backdropUrl} alt="" className="kenburns absolute inset-0 h-full w-full object-cover" />
        )}
        {/* oxblood grade + vignette */}
        <div className="absolute inset-0 bg-[#5b0f18] opacity-[.34] mix-blend-color" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(11,7,7,.92)_0%,rgba(11,7,7,.55)_38%,rgba(11,7,7,0)_68%),linear-gradient(to_top,var(--color-bg)_0%,rgba(11,7,7,.65)_22%,rgba(11,7,7,0)_50%),linear-gradient(to_bottom,rgba(11,7,7,.75)_0%,rgba(11,7,7,0)_18%)] max-lg:bg-[linear-gradient(to_top,var(--color-bg)_6%,rgba(11,7,7,.85)_45%,rgba(11,7,7,.15)_78%),linear-gradient(to_bottom,rgba(11,7,7,.7),transparent_18%)]" />
        <div className="absolute inset-x-[-10%] bottom-[-30%] h-[60%] bg-[radial-gradient(ellipse_at_25%_100%,rgba(122,22,33,.45),transparent_60%)]" />
        <div className={`absolute inset-0 bg-bg transition-opacity duration-500 ${fading ? "opacity-100" : "opacity-0"}`} />
      </div>

      <div className="gutter absolute inset-0 z-10 flex items-end pb-[168px] max-lg:pb-[150px]">
        <div className={`max-w-[680px] transition-all duration-700 ${fading ? "translate-y-3 opacity-0" : "opacity-100"}`}>
          <div className="eyebrow">
            <span className="live-dot" />
            <span>{slide.opening ? `${t("openingNight")} · ${formatShowtime(slide.opening.startsAt)}` : `${t("nowShowing")} · No. ${ROMAN[i]}`}</span>
            <span className="ml-2 border-l border-[var(--line-2)] pl-3.5 tracking-[.08em] text-ink-3 max-sm:ml-0 max-sm:basis-full max-sm:border-0 max-sm:pl-0">HD · 5.1</span>
          </div>
          {kicker && <div className="lbl mt-6 tracking-[.32em] text-ink-2">{kicker}</div>}
          <h1 className="display mt-1.5 -ml-1 text-[clamp(48px,9vw,140px)] leading-[.88]">{name}</h1>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[15px] font-medium text-ink-2">
            {meta.map((m, k) => (
              <span key={k} className="flex items-center gap-4">
                {k > 0 && <i className="h-1 w-1 rounded-full bg-gold" />}
                {m}
              </span>
            ))}
          </div>
          <p className="mt-3.5 line-clamp-3 max-w-[540px] text-[18px] leading-[1.6] text-ink-2 max-sm:text-[16px]">{title.synopsis}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {slide.opening ? (
              <Link href={`/opening/${slide.opening.screeningId}`} className="btn btn-red">{t("prebook")} · {formatInr(title.pricePaise)}</Link>
            ) : slide.owned ? (
              <Link href={`/watch/${title.id}`} className="btn btn-ivory">▶ {t("watch")}</Link>
            ) : (
              <Link href={`/title/${title.slug}?book=1`} className="btn btn-red">{t("book")} · {formatInr(title.pricePaise)}</Link>
            )}
            <Link href={`/title/${title.slug}`} className="btn btn-ghost">{t("moreInfo")}</Link>
            {title.trailerUrl && (
              <button className="icon-btn btn-ghost" aria-label="Sound" onClick={() => setSound((s) => !s)}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
                  {sound ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />}
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {slides.length > 1 && (
        <nav
          className="no-scrollbar absolute inset-x-0 bottom-0 z-10 mx-[var(--gutter)] grid grid-cols-4 border-t border-[var(--line-2)] pb-6 max-lg:mx-0 max-lg:grid-cols-[repeat(4,220px)] max-lg:overflow-x-auto max-lg:px-4 max-lg:pb-4"
          aria-label="Films"
        >
          {slides.slice(0, 4).map((s, k) => (
            <button
              key={s.title.id}
              onClick={() => go(k)}
              aria-current={k === i}
              className={`group relative grid grid-cols-[96px_1fr] items-center gap-3 py-4 pr-3.5 text-left ${k > 0 ? "border-l border-[var(--line)] pl-3.5" : ""}`}
            >
              {k === i && !paused && !sound && (
                <span className="absolute -top-px left-0 h-px bg-gold" style={{ animation: `fill ${ROTATE_MS}ms linear forwards`, width: 0 }} />
              )}
              <span className={`aspect-video overflow-hidden rounded transition-opacity ${k === i ? "opacity-100" : "opacity-55 group-hover:opacity-100"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.title.backdropUrl} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0">
                <b className={`block truncate text-[16px] font-semibold transition-colors ${k === i ? "text-ink" : "text-ink-3"}`}>
                  <i className="mr-0.5 text-base text-gold">{ROMAN[k]}.</i> {s.title.name}
                </b>
                <small className="text-[12.5px] tracking-[.06em] text-ink-3">
                  {s.opening ? `${t("openingNight")} · ${formatShowtime(s.opening.startsAt, { weekday: false })}` : `${formatInr(s.title.pricePaise)} · ${s.title.type === "SERIES" ? "Series" : s.title.durationSec ? formatDuration(s.title.durationSec) : ""}`}
                </small>
              </span>
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}
