import type { Metadata } from "next";
import Link from "next/link";
import type { AdminTitleRow } from "@ott/shared";
import { apiGet } from "@/lib/api-server";
import { formatInr, formatShowtime } from "@/lib/format";

export const metadata: Metadata = { title: "Films & series · Staff" };

function Status({ t }: { t: AdminTitleRow }) {
  if (t.published) return <span className="chip chip-ox">Published</span>;
  if (t.publishAt) return <span className="chip text-gold">Live {formatShowtime(t.publishAt)}</span>;
  return <span className="chip">Draft</span>;
}

export default async function AdminTitlesPage() {
  const titles = await apiGet<AdminTitleRow[]>("/admin/titles");
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[clamp(40px,5vw,68px)]">Films & series</h1>
        <Link href="/admin/titles/new" className="btn btn-sm btn-red">+ New film or series</Link>
      </div>
      <div className="panel divide-y divide-[var(--line)]">
        {titles.length === 0 && <p className="p-5 text-ink-3">Nothing here yet. Add your first film.</p>}
        {titles.map((t) => (
          <Link key={t.id} href={`/admin/titles/${t.id}`} className="flex items-center gap-4 p-3 pr-5 transition-colors hover:bg-[var(--gold-soft)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.posterUrl} alt="" className="aspect-[2/3] w-12 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold">{t.name}</p>
              <p className="text-sm text-ink-3">
                {t.type === "MOVIE" ? "Film" : "Series"} · {t.year}
                {!t.hasVideo && <span className="text-gold"> · {t.type === "MOVIE" ? "no stream yet" : "no episodes yet"}</span>}
                {t.featured && " · featured"}
              </p>
            </div>
            <div className="hidden text-right text-sm text-ink-2 sm:block [font-variant-numeric:lining-nums_tabular-nums]">
              <div>{formatInr(t.pricePaise)}</div>
              <div className="text-ink-3">{t.ticketsSold} sold</div>
            </div>
            <Status t={t} />
          </Link>
        ))}
      </div>
    </div>
  );
}
