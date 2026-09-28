import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ScreeningSummary, TitleDetail, TitleSummary } from "@ott/shared";
import { EpisodeList } from "@/components/EpisodeList";
import { PosterCard } from "@/components/Row";
import { TitleActions } from "@/components/TitleActions";
import { ApiError, apiGet, getCinema, getMe, getScreenings, getSimilar, getTickets } from "@/lib/api-server";
import { formatDuration, formatShowtime, formatTime, maturityLabel } from "@/lib/format";
import { getT } from "@/lib/lang-server";

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
  const { slug } = await params;
  const [title, me, t] = await Promise.all([loadTitle(slug), getMe().catch(() => null), getT()]);
  const [similar, screenings, cinema, tickets] = await Promise.all([
    getSimilar(slug).catch((): TitleSummary[] => []),
    getScreenings().catch((): ScreeningSummary[] => []),
    getCinema(7).catch(() => null),
    me ? getTickets().catch(() => []) : [],
  ]);
  const mine = tickets.filter((x) => x.title.id === title.id && !x.isGiftForOthers);
  const playable = mine.some((x) => ["READY", "ACTIVE", "LIVE"].includes(x.state));
  const opening = screenings.find((s) => s.title.id === title.id && s.state !== "ENDED");
  const upcomingOnly = opening?.state === "UPCOMING" && !playable;
  const bigScreen = cinema?.days.flatMap((d) => d.showtimes.filter((s) => s.title?.id === title.id).map((s) => ({ ...s, bookingUrl: d.bookingUrl }))) ?? [];

  const meta = [
    String(title.year),
    maturityLabel(title.maturity),
    title.type === "MOVIE" && title.durationSec ? formatDuration(title.durationSec) : `${title.seasons.length} season${title.seasons.length === 1 ? "" : "s"}`,
    title.language,
  ];

  return (
    <div>
      <section className="relative flex min-h-[78svh] items-end overflow-hidden pt-[120px] pb-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={title.backdropUrl} alt="" className="kenburns absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#5b0f18] opacity-[.34] mix-blend-color" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(11,7,7,.92),rgba(11,7,7,.45)_45%,transparent_75%),linear-gradient(to_top,var(--color-bg),rgba(11,7,7,.5)_35%,transparent_60%)] max-lg:bg-[linear-gradient(to_top,var(--color-bg)_10%,rgba(11,7,7,.8)_55%,rgba(11,7,7,.2))]" />
        <div className="gutter relative max-w-4xl">
          <div className="eyebrow">
            {opening ? (
              <>
                <span className="live-dot" />
                {t("openingNight")} · {formatShowtime(opening.startsAt)}
              </>
            ) : (
              title.genres.map((g) => g.name).join(" · ")
            )}
          </div>
          <h1 className="display mt-3 text-[clamp(54px,9vw,132px)]">{title.name}</h1>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[15px] font-medium text-ink-2">
            {meta.map((m, k) => (
              <span key={k} className="flex items-center gap-4">
                {k > 0 && <i className="h-1 w-1 rounded-full bg-gold" />}
                {m}
              </span>
            ))}
          </div>
          <p className="mt-4 max-w-2xl font-serif text-[21px] leading-[1.45] text-ink-2">{title.synopsis}</p>
          <div className="mt-7">
            <Suspense>
              <TitleActions
                title={title}
                playable={playable}
                signedIn={!!me}
                inMyList={title.inMyList}
                myRating={title.myRating}
                openingId={upcomingOnly ? opening!.id : undefined}
              />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="gutter grid gap-12 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-12">
          {title.type === "SERIES" && <EpisodeList titleId={title.id} seasons={title.seasons} />}
          {bigScreen.length > 0 && (
            <section className="panel p-6">
              <div className="lbl text-gold">{cinema!.cinema.name}</div>
              <h2 className="mt-2 font-serif text-[32px] font-light italic">{t("cinemaTitle")}</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {bigScreen.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <a href={s.bookingUrl} target="_blank" rel="noopener" className="flex items-center justify-between rounded-lg px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-[var(--gold-soft)]">
                      <span>{new Date(s.startsAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })}</span>
                      <span className="[font-variant-numeric:lining-nums_tabular-nums] text-ink-2">{formatTime(s.startsAt)} ↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <dl className="space-y-5 text-[15px]">
          {title.directors.length > 0 && (
            <div>
              <dt className="lbl text-[11px] text-ink-3">{t("directors")}</dt>
              <dd className="mt-1 font-serif text-xl">
                {title.directors.map((d) => <Link key={d} href={`/search?q=${encodeURIComponent(d)}`} className="hover:text-gold">{d}</Link>)}
              </dd>
            </div>
          )}
          <div>
            <dt className="lbl text-[11px] text-ink-3">{t("cast")}</dt>
            <dd className="mt-1 flex flex-wrap gap-x-3 font-serif text-xl">
              {title.cast.map((c) => <Link key={c} href={`/search?q=${encodeURIComponent(c)}`} className="hover:text-gold">{c}</Link>)}
            </dd>
          </div>
          <div>
            <dt className="lbl text-[11px] text-ink-3">Genres</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {title.genres.map((g) => <Link key={g.slug} href={`/search?genre=${g.slug}`} className="chip hover:text-ink">{g.name}</Link>)}
              {title.tags.map((tag) => <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`} className="chip hover:text-ink">{tag}</Link>)}
            </dd>
          </div>
        </dl>
      </div>

      {similar.length > 0 && (
        <section className="mt-20">
          <h2 className="gutter mb-4 font-serif text-[36px] font-light italic">{t("moreLikeThis")}</h2>
          <div className="gutter no-scrollbar flex gap-4 overflow-x-auto pb-2 [&>*]:w-[42vw] sm:[&>*]:w-[200px]">
            {similar.map((s) => <PosterCard key={s.id} title={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}
