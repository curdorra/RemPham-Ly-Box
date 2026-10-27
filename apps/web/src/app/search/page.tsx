import type { Metadata } from "next";
import Link from "next/link";
import type { Genre, SearchResponse, TitleSummary } from "@ott/shared";
import { TitleGrid } from "@/components/TitleGrid";
import { apiGet } from "@/lib/api-server";
import { getT } from "@/lib/lang-server";

export const metadata: Metadata = { title: "Search" };

type Search = { q?: string; genre?: string; type?: "MOVIE" | "SERIES" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getT();
  const browse = new URLSearchParams();
  if (sp.genre) browse.set("genre", sp.genre);
  if (sp.type === "MOVIE" || sp.type === "SERIES") browse.set("type", sp.type);
  browse.set("limit", "60");

  // Free text uses the typo-tolerant engine; filters alone browse the catalog.
  const [genres, found, browsed] = await Promise.all([
    apiGet<Genre[]>("/catalog/genres"),
    sp.q ? apiGet<SearchResponse>(`/search?${new URLSearchParams({ q: sp.q, limit: "50" })}`) : null,
    sp.q ? null : apiGet<{ total: number; items: TitleSummary[] }>(`/catalog/titles?${browse}`),
  ]);
  const titles = found
    ? found.results.map((r) => r.title).filter((x) => (!sp.type || x.type === sp.type) && (!sp.genre || x.genres.some((g) => g.slug === sp.genre)))
    : browsed!.items;

  const href = (patch: Partial<Search>) => {
    const next = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/search?${next}`;
  };
  const chip = (active: boolean) => `inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors ${active ? "bg-ink text-[#20272a]" : "bg-[rgba(243,244,242,.09)] hover:bg-[rgba(243,244,242,.16)]"}`;

  return (
    <div className="gutter space-y-6 pt-32">
      <h1 className="display text-[clamp(32px,3.6vw,44px)]">{t("search")}</h1>
      <form action="/search" className="flex gap-2">
        {sp.genre && <input type="hidden" name="genre" value={sp.genre} />}
        {sp.type && <input type="hidden" name="type" value={sp.type} />}
        <input name="q" defaultValue={sp.q} placeholder={t("searchPlaceholder")} className="h-[52px] w-full rounded-[14px] bg-[rgba(243,244,242,.09)] px-5 text-lg outline-none backdrop-blur-xl placeholder:text-ink-3 focus:bg-[rgba(243,244,242,.14)]" autoFocus={!sp.q} />
        <button className="btn btn-red h-[52px]">{t("search")}</button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link href={href({ type: undefined })} className={chip(!sp.type)}>All</Link>
        <Link href={href({ type: "MOVIE" })} className={chip(sp.type === "MOVIE")}>Films</Link>
        <Link href={href({ type: "SERIES" })} className={chip(sp.type === "SERIES")}>Series</Link>
        <span className="mx-1 self-stretch border-l border-[var(--line)]" />
        {genres.map((g) => (
          <Link key={g.slug} href={href({ genre: sp.genre === g.slug ? undefined : g.slug })} className={chip(sp.genre === g.slug)}>
            {g.name}
          </Link>
        ))}
      </div>

      {sp.q && <h2 className="font-serif text-[26px] font-medium">{t("resultsFor")} “{sp.q}”</h2>}
      {found?.didYouMean && (
        <p className="text-lg">
          {t("didYouMean")}{" "}
          <Link href={`/search?${new URLSearchParams({ q: found.didYouMean })}`} className="text-xl font-semibold text-gold hover:underline">{found.didYouMean}</Link>?
        </p>
      )}
      {!!found?.people.length && (
        <div className="flex flex-wrap gap-3">
          <span className="lbl self-center text-ink-3">{t("people")}</span>
          {found.people.map((p) => (
            <Link key={`${p.role}:${p.name}`} href={`/search?${new URLSearchParams({ q: p.name })}`} className="panel rounded-full px-5 py-2.5 hover:bg-[var(--gold-soft)]">
              <b className="font-semibold">{p.name}</b>
              <small className="ml-2 text-ink-3">{p.role} · {p.titles.map((x) => x.name).join(", ")}</small>
            </Link>
          ))}
        </div>
      )}
      {titles.length ? <TitleGrid titles={titles} /> : <p className="text-ink-3">{t("nothingFound")}</p>}
    </div>
  );
}
