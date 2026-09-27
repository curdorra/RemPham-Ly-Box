import Link from "next/link";
import type { TitleSummary } from "@ott/shared";

export function TitleCard({ title, progress }: { title: TitleSummary; progress?: number }) {
  return (
    <Link
      href={`/title/${title.slug}`}
      className="group relative block w-36 shrink-0 overflow-hidden rounded-md bg-panel sm:w-44"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={title.posterUrl}
        alt={title.name}
        loading="lazy"
        className="aspect-[2/3] w-full object-cover transition duration-300 group-hover:scale-105 group-hover:opacity-80"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-8">
        <p className="truncate text-sm font-semibold">{title.name}</p>
      </div>
      {progress !== undefined && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
          <div className="h-full bg-brand" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      )}
    </Link>
  );
}
