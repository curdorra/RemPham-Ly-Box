"use client";

import Link from "next/link";
import { useState } from "react";
import type { Season } from "@ott/shared";
import { formatDuration } from "@/lib/format";

export function EpisodeList({ titleId, seasons }: { titleId: string; seasons: Season[] }) {
  const [seasonId, setSeasonId] = useState(seasons[0]?.id);
  const season = seasons.find((s) => s.id === seasonId) ?? seasons[0];
  if (!season) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[34px] font-light italic">Episodes</h2>
        {seasons.length > 1 && (
          <select
            value={season.id}
            onChange={(e) => setSeasonId(e.target.value)}
            className="field h-10 w-auto"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <ol className="divide-y divide-[var(--line)]">
        {season.episodes.map((ep) => (
          <li key={ep.id}>
            <Link href={`/watch/${titleId}?episode=${ep.id}`} className="flex gap-4 rounded-lg py-4 hover:bg-[var(--gold-soft)]">
              <span className="w-8 shrink-0 pt-5 text-center font-serif text-3xl text-gold italic">{ep.number}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ep.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-40 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <p className="font-serif text-xl italic">{ep.name}</p>
                  <span className="shrink-0 text-sm text-ink-3">{formatDuration(ep.durationSec)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-ink-3">{ep.synopsis}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
