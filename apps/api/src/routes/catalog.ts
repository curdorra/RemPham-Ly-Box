import { Router } from "express";
import type { CatalogRow, HomeFeed, TitleDetail } from "@ott/shared";
import { catalogQuerySchema } from "@ott/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { titleSummaryInclude, toEpisode, toTitleSummary } from "../lib/serialize.js";

export const catalogRouter = Router();

const published = { published: true } satisfies Prisma.TitleWhereInput;

catalogRouter.get("/genres", async (_req, res) => {
  const genres = await prisma.genre.findMany({
    where: { titles: { some: published } },
    orderBy: { name: "asc" },
  });
  res.json(genres.map((g) => ({ slug: g.slug, name: g.name })));
});

catalogRouter.get("/home", async (_req, res) => {
  const [featured, newest, genres] = await Promise.all([
    prisma.title.findMany({ where: { ...published, featured: true }, include: titleSummaryInclude, take: 5 }),
    prisma.title.findMany({ where: published, include: titleSummaryInclude, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.genre.findMany({
      where: { titles: { some: published } },
      include: { titles: { where: published, include: titleSummaryInclude, take: 20 } },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: CatalogRow[] = [
    { id: "new", label: "New on RemPham", titles: newest.map(toTitleSummary) },
    { id: "series", label: "Binge-worthy Series", titles: newest.filter((t) => t.type === "SERIES").map(toTitleSummary) },
    ...genres.map((g) => ({ id: `genre-${g.slug}`, label: g.name, titles: g.titles.map(toTitleSummary) })),
  ].filter((r) => r.titles.length > 0);

  const hero = featured.length ? featured[Math.floor(Math.random() * featured.length)] : newest[0];
  const feed: HomeFeed = { hero: hero ? toTitleSummary(hero) : null, rows };
  res.json(feed);
});

catalogRouter.get("/titles", async (req, res) => {
  const q = catalogQuerySchema.parse(req.query);
  const where: Prisma.TitleWhereInput = {
    ...published,
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
  const title = await prisma.title.findFirst({
    where: { ...published, slug: req.params.slug },
    include: {
      ...titleSummaryInclude,
      seasons: { orderBy: { number: "asc" }, include: { episodes: { orderBy: { number: "asc" } } } },
      inLists: req.userId ? { where: { userId: req.userId } } : false,
    },
  });
  if (!title) throw notFound("Title");

  const detail: TitleDetail = {
    ...toTitleSummary(title),
    cast: title.cast,
    seasons: title.seasons.map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      episodes: s.episodes.map(toEpisode),
    })),
    inMyList: Array.isArray(title.inLists) && title.inLists.length > 0,
  };
  res.json(detail);
});
