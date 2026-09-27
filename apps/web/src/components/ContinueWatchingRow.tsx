import Link from "next/link";
import type { ContinueWatchingItem } from "@ott/shared";

export function ContinueWatchingRow({ items }: { items: ContinueWatchingItem[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="px-4 text-lg font-semibold sm:px-10">Continue Watching</h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2 sm:px-10">
        {items.map((item) => {
          const href = `/watch/${item.title.id}${item.episode ? `?episode=${item.episode.id}` : ""}`;
          const img = item.episode?.thumbnailUrl ?? item.title.backdropUrl;
          return (
            <Link key={item.title.id} href={href} className="group w-64 shrink-0 overflow-hidden rounded-md bg-panel">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" loading="lazy" className="aspect-video w-full object-cover group-hover:opacity-80" />
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                  <div className="h-full bg-brand" style={{ width: `${(item.positionSec / item.durationSec) * 100}%` }} />
                </div>
              </div>
              <div className="p-2 text-sm">
                <p className="truncate font-semibold">{item.title.name}</p>
                {item.episode && (
                  <p className="truncate text-muted">
                    S{item.episode.seasonNumber}:E{item.episode.number} {item.episode.name}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
