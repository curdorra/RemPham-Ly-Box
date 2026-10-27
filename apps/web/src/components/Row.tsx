import Link from "next/link";
import type { CatalogRow, TitleSummary } from "@ott/shared";
import { formatInr } from "@/lib/format";

export function PosterCard({ title, rank }: { title: TitleSummary; rank?: number }) {
  return (
    <Link href={`/title/${title.slug}`} className="group relative block shrink-0">
      {rank !== undefined && (
        <span className="pointer-events-none absolute bottom-10 -left-3 z-10 font-serif text-[110px] leading-none font-light text-transparent [-webkit-text-stroke:1.5px_var(--color-gold)] max-sm:text-[80px]">
          {rank}
        </span>
      )}
      <div className={`poster ${rank !== undefined ? "ml-10 max-sm:ml-7" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={title.posterUrl} alt="" loading="lazy" />
        {title.type === "SERIES" && <span className="chip absolute top-2.5 left-2.5 bg-[rgba(11,7,7,.6)] backdrop-blur">Series</span>}
      </div>
      <div className={`mt-3 ${rank !== undefined ? "ml-10 max-sm:ml-7" : ""}`}>
        <h3 className="truncate text-[16px] leading-tight font-semibold">{title.name}</h3>
        <p className="text-[13px] text-ink-3">
          {title.year} · {formatInr(title.pricePaise)}
        </p>
      </div>
    </Link>
  );
}

export function Row({ row }: { row: CatalogRow }) {
  return (
    <section className="mt-14" aria-label={row.label}>
      <h2 className="headline gutter mb-4 text-[24px] sm:text-[28px]">{row.label}</h2>
      <div className="gutter no-scrollbar flex gap-4 overflow-x-auto pb-2 [&>*]:w-[42vw] sm:[&>*]:w-[200px] lg:[&>*]:w-[220px]">
        {row.titles.map((t, i) => (
          <PosterCard key={t.id} title={t} rank={row.ranked ? i + 1 : undefined} />
        ))}
      </div>
    </section>
  );
}
