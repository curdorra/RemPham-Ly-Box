import type { Genre, Profile, Title } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { titleSummaryInclude } from "./serialize.js";

/**
 * Recommendations for a small, growing catalog. Three signals, blended:
 *  - content similarity (genres, cast, directors, language, tags) — works from day one;
 *  - co-watching ("households who watched X also watched Y") — improves with every sale;
 *  - popularity and freshness — for new viewers and as a tie-breaker.
 * Weights are plain constants so they can be tuned against real data later.
 */

type CatalogTitle = Title & { genres: Genre[] };

const POPULARITY_DAYS = 14;
const STATS_TTL_MS = 60_000;

export const SIGNAL_WEIGHTS = {
  love: 3,
  like: 2,
  completed: 2,
  ticket: 1.5,
  started: 1,
  myList: 1,
  dislike: -2.5,
} as const;

const BLEND = { content: 0.6, coWatch: 0.4, popularity: 0.25, freshness: 0.1 } as const;

interface CatalogStats {
  titles: CatalogTitle[];
  byId: Map<string, CatalogTitle>;
  /** Paid tickets + finished views in the last POPULARITY_DAYS. */
  popularity: Map<string, number>;
  /** Accounts that bought or finished each title. */
  audience: Map<string, Set<string>>;
}

let statsCache: { at: number; stats: CatalogStats } | null = null;

export function invalidateRecommendations() {
  statsCache = null;
}

export async function catalogStats(): Promise<CatalogStats> {
  if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) return statsCache.stats;
  const since = new Date(Date.now() - POPULARITY_DAYS * 86400_000);
  const [titles, tickets, finished] = await Promise.all([
    prisma.title.findMany({ where: { published: true }, include: titleSummaryInclude }),
    prisma.ticket.findMany({
      where: { order: { status: "PAID" }, holderId: { not: null } },
      select: { titleId: true, holderId: true, order: { select: { paidAt: true } } },
    }),
    prisma.watchProgress.findMany({
      where: { completed: true },
      select: { titleId: true, updatedAt: true, profile: { select: { userId: true } } },
    }),
  ]);

  const popularity = new Map<string, number>();
  const audience = new Map<string, Set<string>>();
  const bump = (titleId: string, userId: string, at: Date | null) => {
    if (at && at >= since) popularity.set(titleId, (popularity.get(titleId) ?? 0) + 1);
    const set = audience.get(titleId) ?? new Set<string>();
    set.add(userId);
    audience.set(titleId, set);
  };
  for (const t of tickets) bump(t.titleId, t.holderId!, t.order.paidAt);
  for (const f of finished) bump(f.titleId, f.profile.userId, f.updatedAt);

  const stats = { titles, byId: new Map(titles.map((t) => [t.id, t])), popularity, audience };
  statsCache = { at: Date.now(), stats };
  return stats;
}

function jaccard(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a.map((x) => x.toLowerCase()));
  let inter = 0;
  const sb = new Set(b.map((x) => x.toLowerCase()));
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** 0..1: how alike two titles are on paper. */
export function contentSimilarity(a: CatalogTitle, b: CatalogTitle) {
  return (
    0.4 * jaccard(a.genres.map((g) => g.slug), b.genres.map((g) => g.slug)) +
    0.2 * jaccard(a.cast, b.cast) +
    0.15 * jaccard(a.directors, b.directors) +
    0.1 * (a.language === b.language ? 1 : 0) +
    0.1 * jaccard(a.tags, b.tags) +
    0.05 * (a.type === b.type ? 1 : 0)
  );
}

/** 0..1: cosine overlap of the accounts that watched each title. */
export function coWatchSimilarity(stats: CatalogStats, a: string, b: string) {
  const ua = stats.audience.get(a);
  const ub = stats.audience.get(b);
  if (!ua?.size || !ub?.size) return 0;
  let inter = 0;
  for (const u of ua) if (ub.has(u)) inter++;
  return inter / Math.sqrt(ua.size * ub.size);
}

function similarity(stats: CatalogStats, a: CatalogTitle, b: CatalogTitle) {
  return BLEND.content * contentSimilarity(a, b) + BLEND.coWatch * coWatchSimilarity(stats, a.id, b.id);
}

function popularityScore(stats: CatalogStats, id: string) {
  const max = Math.max(1, ...stats.popularity.values());
  return (stats.popularity.get(id) ?? 0) / max;
}

function freshness(t: Title) {
  const ageDays = (Date.now() - t.createdAt.getTime()) / 86400_000;
  return Math.max(0, 1 - ageDays / 60);
}

export interface Signals {
  /** titleId → summed weight (negative = dislike). */
  weights: Map<string, number>;
  /** Titles the profile finished or said "not for me" to: never recommended. */
  exclude: Set<string>;
  /** Most recent title the profile finished, liked or loved. */
  anchor: string | null;
}

export async function profileSignals(profile: Profile): Promise<Signals> {
  const [ratings, progress, list, tickets] = await Promise.all([
    prisma.rating.findMany({ where: { profileId: profile.id } }),
    prisma.watchProgress.findMany({ where: { profileId: profile.id }, orderBy: { updatedAt: "desc" } }),
    prisma.myListItem.findMany({ where: { profileId: profile.id } }),
    prisma.ticket.findMany({ where: { holderId: profile.userId, order: { status: "PAID" } }, select: { titleId: true } }),
  ]);

  const weights = new Map<string, number>();
  const add = (id: string, w: number) => weights.set(id, (weights.get(id) ?? 0) + w);
  const exclude = new Set<string>();
  const recent: { id: string; at: Date }[] = [];

  for (const r of ratings) {
    add(r.titleId, r.value === 2 ? SIGNAL_WEIGHTS.love : r.value === 1 ? SIGNAL_WEIGHTS.like : SIGNAL_WEIGHTS.dislike);
    if (r.value < 0) exclude.add(r.titleId);
    else recent.push({ id: r.titleId, at: r.updatedAt });
  }
  const seenTitle = new Set<string>();
  for (const p of progress) {
    if (seenTitle.has(p.titleId)) continue; // one signal per title (series have many episodes)
    seenTitle.add(p.titleId);
    if (p.completed && !p.episodeId) {
      add(p.titleId, SIGNAL_WEIGHTS.completed);
      exclude.add(p.titleId);
      recent.push({ id: p.titleId, at: p.updatedAt });
    } else {
      add(p.titleId, SIGNAL_WEIGHTS.started);
      if (p.completed) recent.push({ id: p.titleId, at: p.updatedAt });
    }
  }
  for (const l of list) add(l.titleId, SIGNAL_WEIGHTS.myList);
  for (const id of new Set(tickets.map((t) => t.titleId))) add(id, SIGNAL_WEIGHTS.ticket);

  recent.sort((a, b) => b.at.getTime() - a.at.getTime());
  const anchor = recent.find((r) => (weights.get(r.id) ?? 0) > 0)?.id ?? null;
  return { weights, exclude, anchor };
}

type Allowed = (t: Title) => boolean;

/** "Recommended for you". Falls back to popular + fresh when there are no signals. */
export async function recommend(signals: Signals, allowed: Allowed, limit = 20) {
  const stats = await catalogStats();
  const liked = [...signals.weights].filter(([, w]) => w !== 0);
  const norm = liked.reduce((s, [, w]) => s + Math.abs(w), 0) || 1;

  return stats.titles
    .filter((t) => allowed(t) && !signals.exclude.has(t.id))
    .map((c) => {
      let taste = 0;
      for (const [id, w] of liked) {
        if (id === c.id) continue;
        const other = stats.byId.get(id);
        if (other) taste += (w / norm) * similarity(stats, other, c);
      }
      const score = taste + BLEND.popularity * popularityScore(stats, c.id) + BLEND.freshness * freshness(c);
      return { title: c, score };
    })
    .sort((a, b) => b.score - a.score || a.title.name.localeCompare(b.title.name))
    .slice(0, limit);
}

/** "More like this" / "Because you watched X". */
export async function similarTo(titleId: string, allowed: Allowed, limit = 12, exclude: Set<string> = new Set()) {
  const stats = await catalogStats();
  const anchor = stats.byId.get(titleId);
  if (!anchor) return [];
  return stats.titles
    .filter((t) => t.id !== titleId && allowed(t) && !exclude.has(t.id))
    .map((t) => ({ title: t, score: similarity(stats, anchor, t) + 0.1 * popularityScore(stats, t.id) }))
    .filter((x) => x.score > 0.05)
    .sort((a, b) => b.score - a.score || a.title.name.localeCompare(b.title.name))
    .slice(0, limit);
}

/** Genre slugs ordered by how much the profile's positive signals lean towards them. */
export async function genreAffinity(signals: Signals) {
  const stats = await catalogStats();
  const affinity = new Map<string, number>();
  for (const [id, w] of signals.weights) {
    const t = stats.byId.get(id);
    if (!t) continue;
    for (const g of t.genres) affinity.set(g.slug, (affinity.get(g.slug) ?? 0) + w);
  }
  return affinity;
}

export async function trending(allowed: Allowed, limit = 20) {
  const stats = await catalogStats();
  return stats.titles
    .filter((t) => allowed(t) && (stats.popularity.get(t.id) ?? 0) > 0)
    .sort((a, b) => (stats.popularity.get(b.id) ?? 0) - (stats.popularity.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
