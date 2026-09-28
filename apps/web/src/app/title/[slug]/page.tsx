import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { TitleDetail } from "@ott/shared";
import { BuyTicketButton } from "@/components/BuyTicketButton";
import { EpisodeList } from "@/components/EpisodeList";
import { MyListButton } from "@/components/MyListButton";
import { ApiError, apiGet } from "@/lib/api-server";
import { formatDuration, maturityLabel } from "@/lib/format";

async function loadTitle(slug: string): Promise<TitleDetail> {
  try {
    return await apiGet<TitleDetail>(`/catalog/titles/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const title = await loadTitle((await params).slug);
  return { title: title.name, description: title.synopsis };
}

export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const title = await loadTitle((await params).slug);
  const meta = [
    String(title.year),
    maturityLabel(title.maturity),
    title.type === "MOVIE" && title.durationSec
      ? formatDuration(title.durationSec)
      : `${title.seasons.length} season${title.seasons.length === 1 ? "" : "s"}`,
  ];

  return (
    <div>
      <section className="relative h-[60vh] min-h-[380px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={title.backdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-black/40" />
        <div className="relative flex h-full max-w-3xl flex-col justify-end gap-4 px-4 pb-10 sm:px-10">
          <h1 className="text-4xl font-black sm:text-5xl">{title.name}</h1>
          <p className="text-sm text-white/80">{meta.join(" · ")}</p>
          <div className="flex gap-3">
            <Link href={`/watch/${title.id}`} className="rounded bg-white px-6 py-2 font-semibold text-black hover:bg-white/80">
              ▶ Play
            </Link>
            <MyListButton titleId={title.id} initial={title.inMyList} />
          </div>
          <BuyTicketButton title={title} />
        </div>
      </section>
      <div className="grid gap-10 px-4 sm:px-10 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-10">
          <p className="max-w-3xl text-lg text-white/90">{title.synopsis}</p>
          {title.type === "SERIES" && <EpisodeList titleId={title.id} seasons={title.seasons} />}
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted">Cast</dt>
            <dd>{title.cast.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-muted">Genres</dt>
            <dd className="flex flex-wrap gap-2">
              {title.genres.map((g) => (
                <Link key={g.slug} href={`/search?genre=${g.slug}`} className="hover:underline">
                  {g.name}
                </Link>
              ))}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
