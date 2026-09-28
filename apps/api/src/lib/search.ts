import type { SearchResponse, SearchResult, Suggestion } from "@ott/shared";
import type { Genre, Title } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { titleSummaryInclude, toTitleSummary } from "./serialize.js";

/**
 * Catalog search that forgives typos and Mizo diacritics. The catalog is small
 * (hundreds of titles, not millions), so an in-memory index rebuilt every
 * minute is faster and simpler than a search service or DB extensions.
 */

/** "Ṭhingpui Â-ê!" → "thingpui a e": lower-case, no diacritics, no punctuation. */
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const tokens = (text: string) => normalize(text).split(" ").filter(Boolean);

function trigrams(word: string) {
  const padded = `  ${word} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/** Trigram similarity (0..1), the same measure as Postgres pg_trgm. */
export function similarity(a: string, b: string) {
  if (a === b) return 1;
  const ga = trigrams(a);
  const gb = trigrams(b);
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}

/** How well one query word matches one document word. */
function wordScore(q: string, w: string) {
  if (q === w) return 1;
  if (w.startsWith(q) && q.length >= 2) return 0.85; // typing in progress
  if (q.length < 3) return 0;
  const sim = similarity(q, w);
  return sim >= 0.3 ? sim * 0.8 : 0; // typo ("steal" ~ "steel" is 0.33)
}

type Field = SearchResult["matched"];
const WEIGHTS: Record<Field, number> = { title: 3, people: 2, genre: 1.5, tag: 1.2, synopsis: 0.4 };

interface Doc {
  title: Title & { genres: Genre[] };
  fields: [Field, string[]][];
  nameNorm: string;
}

let cache: { at: number; docs: Doc[] } | null = null;
const TTL_MS = 60_000;

export function invalidateSearchIndex() {
  cache = null;
}

async function index(): Promise<Doc[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.docs;
  const titles = await prisma.title.findMany({ where: { published: true }, include: titleSummaryInclude });
  const docs = titles.map((t) => ({
    title: t,
    nameNorm: normalize(t.name),
    fields: [
      ["title", tokens([t.name, ...t.altNames].join(" "))],
      ["people", tokens([...t.cast, ...t.directors].join(" "))],
      ["genre", tokens(t.genres.map((g) => g.name).join(" "))],
      ["tag", tokens(t.tags.join(" "))],
      ["synopsis", tokens(t.synopsis)],
    ] as [Field, string[]][],
  }));
  cache = { at: Date.now(), docs };
  return docs;
}

function scoreDoc(doc: Doc, query: string[]): { score: number; matched: Field } | null {
  let total = 0;
  let best: { field: Field; score: number } | null = null;
  for (const q of query) {
    let wordBest = 0;
    let wordField: Field = "synopsis";
    for (const [field, words] of doc.fields) {
      let s = 0;
      for (const w of words) s = Math.max(s, wordScore(q, w));
      const weighted = s * WEIGHTS[field];
      if (weighted > wordBest) {
        wordBest = weighted;
        wordField = field;
      }
    }
    // Every query word must match somewhere ("tears steel" shouldn't match "Steel Rain" alone).
    if (wordBest === 0) return null;
    total += wordBest;
    if (!best || wordBest > best.score) best = { field: wordField, score: wordBest };
  }
  return { score: total / query.length, matched: best!.field };
}

export async function search(
  q: string,
  opts: { limit: number; allowed?: (t: Title) => boolean; popularity?: Map<string, number> },
): Promise<SearchResponse> {
  const query = tokens(q);
  const docs = (await index()).filter((d) => !opts.allowed || opts.allowed(d.title));
  const pop = opts.popularity ?? new Map();
  const maxPop = Math.max(1, ...pop.values());

  const hits = docs
    .map((d) => ({ d, m: query.length ? scoreDoc(d, query) : null }))
    .filter((h): h is { d: Doc; m: { score: number; matched: Field } } => !!h.m)
    .map((h) => ({ ...h, final: h.m.score + ((pop.get(h.d.title.id) ?? 0) / maxPop) * 0.15 }))
    .sort((a, b) => b.final - a.final || a.d.title.name.localeCompare(b.d.title.name));

  // People: group titles by a matching cast/director name.
  const people = new Map<string, { name: string; role: "cast" | "director"; titles: Doc[] }>();
  for (const d of docs) {
    for (const [role, names] of [["cast", d.title.cast], ["director", d.title.directors]] as const) {
      for (const name of names) {
        const words = tokens(name);
        if (query.length && query.every((qw) => words.some((w) => wordScore(qw, w) >= 0.6))) {
          const key = `${role}:${normalize(name)}`;
          const entry = people.get(key) ?? { name, role, titles: [] };
          entry.titles.push(d);
          people.set(key, entry);
        }
      }
    }
  }

  let didYouMean: string | null = null;
  if (!hits.length && query.length) {
    const full = normalize(q);
    const closest = docs
      .map((d) => ({ name: d.title.name, sim: similarity(full, d.nameNorm) }))
      .sort((a, b) => b.sim - a.sim)[0];
    if (closest && closest.sim >= 0.2) didYouMean = closest.name;
  }

  return {
    query: q,
    results: hits.slice(0, opts.limit).map((h) => ({
      title: toTitleSummary(h.d.title),
      matched: h.m.matched,
      score: Math.round(h.final * 1000) / 1000,
    })),
    people: [...people.values()].slice(0, 5).map((p) => ({
      name: p.name,
      role: p.role,
      titles: p.titles.map((d) => toTitleSummary(d.title)),
    })),
    didYouMean,
  };
}

/** Instant suggestions while typing: titles, then people and genres. */
export async function suggest(q: string, allowed?: (t: Title) => boolean): Promise<Suggestion[]> {
  const query = tokens(q);
  if (!query.length) return [];
  const docs = (await index()).filter((d) => !allowed || allowed(d.title));
  const matches = (text: string) => {
    const words = tokens(text);
    return query.every((qw) => words.some((w) => wordScore(qw, w) >= 0.6));
  };

  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (s: Suggestion) => {
    const key = `${s.kind}:${normalize(s.text)}`;
    if (seen.has(key) || out.length >= 8) return;
    seen.add(key);
    out.push(s);
  };
  for (const d of docs) if (matches([d.title.name, ...d.title.altNames].join(" "))) add({ text: d.title.name, kind: "title", slug: d.title.slug });
  for (const d of docs) for (const p of [...d.title.cast, ...d.title.directors]) if (matches(p)) add({ text: p, kind: "person" });
  for (const d of docs) for (const g of d.title.genres) if (matches(g.name)) add({ text: g.name, kind: "genre" });
  return out;
}
