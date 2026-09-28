import { Router } from "express";
import type { Request } from "express";
import type { CatalogRow, HomeFeed, RatingValue, TitleDetail, TitleSummary } from "@ott/shared";
import { catalogQuerySchema } from "@ott/shared";
import type { Prisma, Title } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { KIDS_MATURITIES, currentProfile, visibleTitles } from "../lib/profiles.js";
import { catalogStats, genreAffinity, profileSignals, recommend, similarTo, trending } from "../lib/recommend.js";
import { titleSummaryInclude, toEpisode, toTitleSummary } from "../lib/serialize.js";

export const catalogRouter = Router();

/** A predicate matching visibleTitles() for in-memory lists. */
async function allowedFor(req: Request): Promise<(t: Title) => boolean> {
  if (!req.userId) return (t) => t.published;
  const profile = await currentProfile(req);
  return profile.kids ? (t) => t.published && KIDS_MATURITIES.includes(t.maturity) : (t) => t.published;
}

catalogRouter.get("/genres", async (req, res) => {
  const visible = await visibleTitles(req);
  const genres = await prisma.genre.findMany({ where: { titles: { some: visible } }, orderBy: { name: "asc" } });
  res.json(genres.map((g) => ({ slug: g.slug, name: g.name })));
});

async function topTen(visible: Prisma.TitleWhereInput) {
  const since = new Date(Date.now() - 7 * 86400_000);
  const groups = await prisma.ticket.groupBy({
    by: ["titleId"],
    where: { order: { status: "PAID", paidAt: { gte: since } }, title: visible },
    _count: { _all: true },
  });
  const ranked = groups.sort((a, b) => b._count._all - a._count._all).slice(0, 10);
  const titles = await prisma.title.findMany({ where: { id: { in: ranked.map((g) => g.titleId) } }, include: titleSummaryInclude });
  const byId = new Map(titles.map((t) => [t.id, t]));
  return ranked.map((g) => byId.get(g.titleId)).filter((t) => !!t).map(toTitleSummary);
}

/**
 * The home feed. Anonymous viewers get popular and new titles; signed-in
 * profiles get rows built from their own history, ratings and list.
 */
catalogRouter.get("/home", async (req, res) => {
  const visible = await visibleTitles(req);
  const allowed = await allowedFor(req);
  const profile = req.userId ? await currentProfile(req) : null;
  const signals = profile ? await profileSignals(profile) : null;
  const stats = await catalogStats();

  const [featured, newest, genres, top, hot, continueRows, myList] = await Promise.all([
    prisma.title.findMany({ where: { ...visible, featured: true }, include: titleSummaryInclude }),
    prisma.title.findMany({ where: visible, include: titleSummaryInclude, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.genre.findMany({
      where: { titles: { some: visible } },
      include: { titles: { where: visible, include: titleSummaryInclude, take: 20 } },
      orderBy: { name: "asc" },
    }),
    topTen(visible),
    trending(allowed),
    profile
      ? prisma.watchProgress.findMany({
          where: { profileId: profile.id, completed: false, positionSec: { gt: 0 }, title: visible },
          include: { title: { include: titleSummaryInclude } },
          orderBy: { updatedAt: "desc" },
          take: 40,
        })
      : [],
    profile
      ? prisma.myListItem.findMany({
          where: { profileId: profile.id, title: visible },
          include: { title: { include: titleSummaryInclude } },
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  const rows: CatalogRow[] = [];
  const seenContinue = new Set<string>();
  const continueTitles = continueRows.filter((r) => !seenContinue.has(r.titleId) && seenContinue.add(r.titleId)).map((r) => toTitleSummary(r.title));
  if (continueTitles.length) rows.push({ id: "continue", kind: "continue", label: `Continue watching for ${profile!.name}`, titles: continueTitles });

  if (top.length) rows.push({ id: "top10", kind: "top10", label: "Top 10 in Mizoram this week", titles: top, ranked: true });

  if (signals?.anchor) {
    const anchor = stats.byId.get(signals.anchor);
    const because = await similarTo(signals.anchor, allowed, 12, signals.exclude);
    if (anchor && because.length) {
      rows.push({ id: `because-${anchor.slug}`, kind: "because", label: `Because you watched ${anchor.name}`, titles: because.map((b) => toTitleSummary(b.title)) });
    }
  }

  if (signals && signals.weights.size) {
    const picks = await recommend(signals, allowed, 20);
    if (picks.length) rows.push({ id: "for-you", kind: "for_you", label: `Recommended for ${profile!.name}`, titles: picks.map((p) => toTitleSummary(p.title)) });
  }

  if (hot.length) rows.push({ id: "trending", kind: "trending", label: signals?.weights.size ? "Trending now" : "Popular on RemPham Ly Box", titles: hot.map(toTitleSummary) });
  rows.push({ id: "new", kind: "new", label: "New on RemPham Ly Box", titles: newest.map(toTitleSummary) });
  if (myList.length) rows.push({ id: "my-list", kind: "my_list", label: "My List", titles: myList.map((i) => toTitleSummary(i.title)) });

  // Genre rows, most-loved genres first for this profile.
  const affinity = signals ? await genreAffinity(signals) : new Map<string, number>();
  const genreRows: CatalogRow[] = genres
    .map((g) => ({ g, a: affinity.get(g.slug) ?? 0 }))
    .sort((x, y) => y.a - x.a || x.g.name.localeCompare(y.g.name))
    .map(({ g }) => ({ id: `genre-${g.slug}`, kind: "genre", label: g.name, titles: g.titles.map(toTitleSummary) }));
  const series = newest.filter((t) => t.type === "SERIES").map(toTitleSummary);
  if (series.length) genreRows.splice(1, 0, { id: "series", kind: "series", label: "Binge-worthy series", titles: series });
  rows.push(...genreRows);

  // Hero: the best-matching featured title (a random one for anonymous viewers).
  let hero: TitleSummary | null = null;
  if (featured.length) {
    if (signals?.weights.size) {
      const ranked = await recommend(signals, (t) => allowed(t) && t.featured, 1);
      hero = ranked[0] ? toTitleSummary(ranked[0].title) : null;
    }
    hero ??= toTitleSummary(featured[Math.floor(Math.random() * featured.length)]!);
  } else if (newest[0]) {
    hero = toTitleSummary(newest[0]);
  }

  const feed: HomeFeed = { hero, rows: rows.filter((r) => r.titles.length > 0) };
  res.json(feed);
});

catalogRouter.get("/titles", async (req, res) => {
  const q = catalogQuerySchema.parse(req.query);
  const where: Prisma.TitleWhereInput = {
    ...(await visibleTitles(req)),
    ...(q.type && { type: q.type }),
    ...(q.genre && { genres: { some: { slug: q.genre } } }),
    ...(q.q && {
      OR: [
        { name: { contains: q.q, mode: "insensitive" } },
        { synopsis: { contains: q.q, mode: "insensitive" } },
        { cast: { has: q.q } },
      ],
    }),
  };
  const [total, titles] = await Promise.all([
    prisma.title.count({ where }),
    prisma.title.findMany({
      where,
      include: titleSummaryInclude,
      orderBy: [{ year: "desc" }, { name: "asc" }],
      take: q.limit,
      skip: q.offset,
    }),
  ]);
  res.json({ total, items: titles.map(toTitleSummary) });
});

catalogRouter.get("/titles/:slug", async (req, res) => {
  const profile = req.userId ? await currentProfile(req) : null;
  const title = await prisma.title.findFirst({
    where: { ...(await visibleTitles(req)), slug: req.params.slug },
    include: {
      ...titleSummaryInclude,
      seasons: { orderBy: { number: "asc" }, include: { episodes: { orderBy: { number: "asc" } } } },
      inLists: profile ? { where: { profileId: profile.id } } : false,
      ratings: profile ? { where: { profileId: profile.id } } : false,
    },
  });
  if (!title) throw notFound("Title");

  const detail: TitleDetail = {
    ...toTitleSummary(title),
    cast: title.cast,
    directors: title.directors,
    tags: title.tags,
    seasons: title.seasons.map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      episodes: s.episodes.map(toEpisode),
    })),
    inMyList: Array.isArray(title.inLists) && title.inLists.length > 0,
    myRating: Array.isArray(title.ratings) && title.ratings[0] ? (title.ratings[0].value as RatingValue) : null,
  };
  res.json(detail);
});

/** "More like this". */
catalogRouter.get("/titles/:slug/similar", async (req, res) => {
  const title = await prisma.title.findFirst({ where: { ...(await visibleTitles(req)), slug: req.params.slug } });
  if (!title) throw notFound("Title");
  const similar = await similarTo(title.id, await allowedFor(req), 12);
  res.json(similar.map((s) => toTitleSummary(s.title)));
});
