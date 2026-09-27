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
        <h2 className="text-xl font-semibold">Episodes</h2>
        {seasons.length > 1 && (
          <select
            value={season.id}
            onChange={(e) => setSeasonId(e.target.value)}
            className="rounded border border-white/20 bg-panel px-3 py-1.5"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <ol className="divide-y divide-white/10">
        {season.episodes.map((ep) => (
          <li key={ep.id}>
            <Link href={`/watch/${titleId}?episode=${ep.id}`} className="flex gap-4 py-4 hover:bg-white/5">
              <span className="w-6 shrink-0 pt-6 text-center text-xl text-muted">{ep.number}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ep.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-40 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <p className="font-semibold">{ep.name}</p>
                  <span className="shrink-0 text-sm text-muted">{formatDuration(ep.durationSec)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{ep.synopsis}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
