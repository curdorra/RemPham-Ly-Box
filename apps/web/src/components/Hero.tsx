import Link from "next/link";
import type { TitleSummary } from "@ott/shared";
import { maturityLabel } from "@/lib/format";

export function Hero({ title }: { title: TitleSummary }) {
  return (
    <section className="relative h-[70vh] min-h-[420px] w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={title.backdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
      <div className="relative flex h-full max-w-2xl flex-col justify-end gap-4 px-4 pb-16 sm:px-10">
        <h1 className="text-4xl font-black sm:text-6xl">{title.name}</h1>
        <div className="flex items-center gap-3 text-sm text-white/80">
          <span>{title.year}</span>
          <span className="rounded border border-white/40 px-1.5 text-xs">{maturityLabel(title.maturity)}</span>
          <span>{title.genres.map((g) => g.name).join(" · ")}</span>
        </div>
        <p className="line-clamp-3 text-white/90">{title.synopsis}</p>
        <div className="flex gap-3">
          <Link href={`/watch/${title.id}`} className="rounded bg-white px-6 py-2 font-semibold text-black hover:bg-white/80">
            ▶ Play
          </Link>
          <Link href={`/title/${title.slug}`} className="rounded bg-white/20 px-6 py-2 font-semibold hover:bg-white/30">
            More info
          </Link>
        </div>
      </div>
    </section>
  );
}
