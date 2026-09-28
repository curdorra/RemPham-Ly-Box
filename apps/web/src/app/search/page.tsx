import type { Metadata } from "next";
import Link from "next/link";
import type { Genre, SearchResponse, TitleSummary } from "@ott/shared";
import { TitleGrid } from "@/components/TitleGrid";
import { apiGet } from "@/lib/api-server";

export const metadata: Metadata = { title: "Browse" };

type Search = { q?: string; genre?: string; type?: "MOVIE" | "SERIES" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const query = new URLSearchParams();
  if (sp.q) query.set("q", sp.q);
  if (sp.genre) query.set("genre", sp.genre);
  if (sp.type === "MOVIE" || sp.type === "SERIES") query.set("type", sp.type);

  // Free text goes to the typo-tolerant search engine; filters alone browse the catalog.
  const [results, genres, found] = await Promise.all([
    apiGet<{ total: number; items: TitleSummary[] }>(`/catalog/titles?${query}`),
    apiGet<Genre[]>("/catalog/genres"),
    sp.q ? apiGet<SearchResponse>(`/search?${new URLSearchParams({ q: sp.q })}`) : null,
  ]);
  if (found) {
    const items = found.results
      .map((r) => r.title)
      .filter((t) => (!sp.type || t.type === sp.type) && (!sp.genre || t.genres.some((g) => g.slug === sp.genre)));
    results.items = items;
    results.total = items.length;
  }

  const withParam = (key: keyof Search, value?: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    return `/search?${next}`;
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? "border-white bg-white text-black" : "border-white/20 hover:border-white/60"}`;

  return (
    <div className="space-y-6 px-4 pt-24 sm:px-10">
      <form action="/search" className="flex gap-2">
        {sp.genre && <input type="hidden" name="genre" value={sp.genre} />}
        {sp.type && <input type="hidden" name="type" value={sp.type} />}
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Titles, people, genres"
          className="w-full max-w-xl rounded border border-white/20 bg-panel px-4 py-2 outline-none focus:border-white/60"
        />
        <button className="rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-hover">Search</button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link href={withParam("type")} className={chip(!sp.type)}>All</Link>
        <Link href={withParam("type", "MOVIE")} className={chip(sp.type === "MOVIE")}>Movies</Link>
        <Link href={withParam("type", "SERIES")} className={chip(sp.type === "SERIES")}>Series</Link>
        <span className="mx-2 border-l border-white/10" />
        {genres.map((g) => (
          <Link key={g.slug} href={withParam("genre", sp.genre === g.slug ? undefined : g.slug)} className={chip(sp.genre === g.slug)}>
            {g.name}
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted">{results.total} result{results.total === 1 ? "" : "s"}</p>
      {found?.didYouMean && (
        <p>
          Did you mean{" "}
          <Link href={`/search?${new URLSearchParams({ q: found.didYouMean })}`} className="text-brand hover:underline">
            {found.didYouMean}
          </Link>
          ?
        </p>
      )}
      {!!found?.people.length && (
        <p className="text-sm text-white/80">
          People:{" "}
          {found.people.map((p) => `${p.name} (${p.role === "director" ? "director" : "cast"})`).join(", ")}
        </p>
      )}
      {results.items.length ? <TitleGrid titles={results.items} /> : <p className="text-muted">Nothing matched.</p>}
    </div>
  );
}
