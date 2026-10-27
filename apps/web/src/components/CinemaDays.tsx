"use client";

import Link from "next/link";
import { useState } from "react";
import type { CinemaSchedule } from "@ott/shared";
import { formatTime } from "@/lib/format";
import { useT } from "./LangProvider";

export function CinemaDays({ schedule }: { schedule: CinemaSchedule }) {
  const t = useT();
  // Open on the first day that has shows.
  const [i, setI] = useState(() => Math.max(0, schedule.days.findIndex((d) => d.showtimes.length > 0)));
  const day = schedule.days[i];
  const label = (date: string, k: number) =>
    k === 0 ? t("today") : k === 1 ? t("tomorrow") : new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="mt-10">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="tablist">
        {schedule.days.map((d, k) => (
          <button
            key={d.date}
            role="tab"
            aria-selected={k === i}
            onClick={() => setI(k)}
            className={`shrink-0 rounded-[10px] px-4 py-2.5 text-left transition ${k === i ? "bg-ox shadow-[inset_0_0_0_1px_var(--color-gold)]" : "shadow-[inset_0_0_0_1px_var(--line)] hover:bg-[var(--gold-soft)]"}`}
          >
            <span className="block text-sm font-semibold">{label(d.date, k)}</span>
            <span className="text-xs text-ink-3">{d.showtimes.length} show{d.showtimes.length === 1 ? "" : "s"}</span>
          </button>
        ))}
      </div>

      {day && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {day.showtimes.length === 0 && <p className="text-ink-3">{t("noShows")}</p>}
          {Object.values(
            day.showtimes.reduce<Record<string, typeof day.showtimes>>((acc, s) => {
              (acc[s.filmName] ||= []).push(s);
              return acc;
            }, {}),
          ).map((shows) => {
            const first = shows[0]!;
            return (
              <div key={first.filmName} className="panel flex gap-4 p-4">
                {first.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={first.posterUrl} alt="" className="aspect-[2/3] w-24 shrink-0 rounded object-cover shadow-[0_0_0_1px_var(--line)]" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="headline text-[24px]">{first.filmName}</h3>
                  <p className="text-[13px] text-ink-3">{[first.language, first.format].filter(Boolean).join(" · ")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shows.map((s) => (
                      <a key={s.id} href={day.bookingUrl} target="_blank" rel="noopener" className="chip hover:bg-[var(--gold-soft)] hover:text-ink">
                        {formatTime(s.startsAt)}
                      </a>
                    ))}
                  </div>
                  {first.title && (
                    <Link href={`/title/${first.title.slug}`} className="mt-3 inline-block text-[13px] text-gold hover:underline">
                      {t("watchAtHome")} →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {day && (
        <a href={day.bookingUrl} target="_blank" rel="noopener" className="btn btn-red mt-8">
          {t("bookOnBms")} · {label(day.date, i)} ↗
        </a>
      )}
    </div>
  );
}
