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
  const chip = (active: boolean) => `chip h-9 px-3.5 ${active ? "bg-ink text-bg shadow-none" : "hover:text-ink"}`;

  return (
    <div className="gutter space-y-7 pt-36">
      <form action="/search" className="flex max-w-2xl gap-2">
        {sp.genre && <input type="hidden" name="genre" value={sp.genre} />}
        {sp.type && <input type="hidden" name="type" value={sp.type} />}
        <input name="q" defaultValue={sp.q} placeholder={t("searchPlaceholder")} className="field h-14 font-serif text-2xl italic" autoFocus={!sp.q} />
        <button className="btn btn-red h-14">{t("search")}</button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link href={href({ type: undefined })} className={chip(!sp.type)}>All</Link>
        <Link href={href({ type: "MOVIE" })} className={chip(sp.type === "MOVIE")}>Films</Link>
        <Link href={href({ type: "SERIES" })} className={chip(sp.type === "SERIES")}>Series</Link>
        <span className="mx-1 border-l border-[var(--line)]" />
        {genres.map((g) => (
          <Link key={g.slug} href={href({ genre: sp.genre === g.slug ? undefined : g.slug })} className={chip(sp.genre === g.slug)}>
            {g.name}
          </Link>
        ))}
      </div>

      {sp.q && <h1 className="font-serif text-[36px] font-light italic">{t("resultsFor")} “{sp.q}”</h1>}
      {found?.didYouMean && (
        <p className="text-lg">
          {t("didYouMean")}{" "}
          <Link href={`/search?${new URLSearchParams({ q: found.didYouMean })}`} className="font-serif text-2xl text-gold italic hover:underline">{found.didYouMean}</Link>?
        </p>
      )}
      {!!found?.people.length && (
        <div className="flex flex-wrap gap-3">
          <span className="lbl self-center text-ink-3">{t("people")}</span>
          {found.people.map((p) => (
            <Link key={`${p.role}:${p.name}`} href={`/search?${new URLSearchParams({ q: p.name })}`} className="panel px-4 py-2.5 hover:bg-[var(--gold-soft)]">
              <b className="font-serif text-lg italic">{p.name}</b>
              <small className="ml-2 text-ink-3">{p.role} · {p.titles.map((x) => x.name).join(", ")}</small>
            </Link>
          ))}
        </div>
      )}
      {titles.length ? <TitleGrid titles={titles} /> : <p className="text-ink-3">{t("nothingFound")}</p>}
    </div>
  );
}
