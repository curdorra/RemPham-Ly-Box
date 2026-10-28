import express, { Router } from "express";
import type { AdminEpisode, AdminTitle, AdminTitleRow } from "@ott/shared";
import {
  episodeInputSchema,
  episodeUpdateSchema,
  seasonInputSchema,
  seasonUpdateSchema,
  slugify,
  subtitleLangSchema,
  titleInputSchema,
  titleUpdateSchema,
  uploadKindSchema,
} from "@ott/shared";
import { Prisma } from "../generated/prisma/client.js";
import type { Episode, Genre, Season, Title, VideoJob } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { listSubtitles, putSubtitle, removeSubtitle } from "../lib/film-subtitles.js";
import { IMAGE_TYPES, saveImage } from "../lib/media.js";
import { catalogChanged } from "../lib/publishing.js";
import { toAdminVideo } from "../lib/video-jobs.js";

/** Films and series, their episodes, and artwork uploads. Mounted under /admin. */
export const adminCatalogRouter = Router();

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function unique<T>(write: Promise<T>, message: string): Promise<T> {
  try {
    return await write;
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", message);
    throw e;
  }
}

const paidTickets = (titleId: string) => prisma.ticket.count({ where: { titleId, order: { status: "PAID" } } });

const genreLinks = (names: string[]) =>
  names
    .map((name) => ({ name, slug: slugify(name) }))
    .filter((g) => g.slug)
    .map((g) => ({ where: { slug: g.slug }, create: g }));

/** A draft scheduled for later stays a draft until then; publishing now clears the schedule. */
function publishFields(input: { published?: boolean; publishAt?: string | null }) {
  const out: { published?: boolean; publishAt?: Date | null } = {};
  if (input.published !== undefined) out.published = input.published;
  if (input.publishAt !== undefined) out.publishAt = input.publishAt ? new Date(input.publishAt) : null;
  if (input.published) out.publishAt = null;
  return out;
}

function toAdminEpisode(e: Episode): AdminEpisode {
  return {
    id: e.id,
    number: e.number,
    name: e.name,
    synopsis: e.synopsis,
    durationSec: e.durationSec,
    thumbnailUrl: e.thumbnailUrl,
    manifestUrl: e.manifestUrl,
    introStartSec: e.introStartSec,
    introEndSec: e.introEndSec,
    creditsStartSec: e.creditsStartSec,
  };
}

type FullTitle = Title & { genres: Genre[]; seasons: (Season & { episodes: Episode[] })[]; videoJob: VideoJob | null };
const fullInclude = {
  genres: { orderBy: { name: "asc" } },
  seasons: { orderBy: { number: "asc" }, include: { episodes: { orderBy: { number: "asc" } } } },
  videoJob: true,
} as const;

async function toAdminTitle(t: FullTitle): Promise<AdminTitle> {
  return {
    id: t.id,
    slug: t.slug,
    type: t.type,
    name: t.name,
    synopsis: t.synopsis,
    year: t.year,
    maturity: t.maturity,
    posterUrl: t.posterUrl,
    backdropUrl: t.backdropUrl,
    language: t.language,
    genres: t.genres.map((g) => g.name),
    cast: t.cast,
    directors: t.directors,
    tags: t.tags,
    altNames: t.altNames,
    featured: t.featured,
    published: t.published,
    publishAt: t.publishAt?.toISOString() ?? null,
    durationSec: t.durationSec,
    manifestUrl: t.manifestUrl,
    trailerUrl: t.trailerUrl,
    pricePaise: t.pricePaise,
    rentalHours: t.rentalHours,
    introStartSec: t.introStartSec,
    introEndSec: t.introEndSec,
    creditsStartSec: t.creditsStartSec,
    seasons: t.seasons.map((s) => ({ id: s.id, number: s.number, name: s.name, episodes: s.episodes.map(toAdminEpisode) })),
    ticketsSold: await paidTickets(t.id),
    video: t.videoJob && toAdminVideo(t.videoJob),
  };
}

async function loadTitle(id: string) {
  const t = await prisma.title.findUnique({ where: { id }, include: fullInclude });
  if (!t) throw notFound("Title");
  return t;
}

// ── Titles ──────────────────────────────────────────────────────────────────

/** Every title, drafts included, newest edits first. */
adminCatalogRouter.get("/titles", async (_req, res) => {
  const [titles, sold] = await Promise.all([
    prisma.title.findMany({
      include: { _count: { select: { seasons: { where: { episodes: { some: {} } } } } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.ticket.groupBy({ by: ["titleId"], where: { order: { status: "PAID" } }, _count: { _all: true } }),
  ]);
  const soldBy = new Map(sold.map((g) => [g.titleId, g._count._all]));
  const rows: AdminTitleRow[] = titles.map((t) => ({
    id: t.id,
    slug: t.slug,
    type: t.type,
    name: t.name,
    year: t.year,
    posterUrl: t.posterUrl,
    pricePaise: t.pricePaise,
    published: t.published,
    publishAt: t.publishAt?.toISOString() ?? null,
    featured: t.featured,
    hasVideo: t.type === "MOVIE" ? !!t.manifestUrl : t._count.seasons > 0,
    ticketsSold: soldBy.get(t.id) ?? 0,
    updatedAt: t.updatedAt.toISOString(),
  }));
  res.json(rows);
});

adminCatalogRouter.get("/titles/:id", async (req, res) => {
  res.json(await toAdminTitle(await loadTitle(req.params.id)));
});

adminCatalogRouter.post("/titles", async (req, res) => {
  const { genres, published, publishAt, ...input } = titleInputSchema.parse(req.body);
  const created = await unique(
    prisma.title.create({
      data: { ...input, ...publishFields({ published, publishAt }), genres: { connectOrCreate: genreLinks(genres) } },
    }),
    "Another title already uses that web address (slug)",
  );
  catalogChanged();
  res.status(201).json(await toAdminTitle(await loadTitle(created.id)));
});

adminCatalogRouter.patch("/titles/:id", async (req, res) => {
  const { genres, published, publishAt, ...input } = titleUpdateSchema.parse(req.body);
  await loadTitle(req.params.id);
  await unique(
    prisma.title.update({
      where: { id: req.params.id },
      data: {
        ...input,
        ...publishFields({ published, publishAt }),
        ...(genres && { genres: { set: [], connectOrCreate: genreLinks(genres) } }),
      },
    }),
    "Another title already uses that web address (slug)",
  );
  catalogChanged();
  res.json(await toAdminTitle(await loadTitle(req.params.id)));
});

/** Only titles nobody has paid for can be deleted; otherwise unpublish them. */
adminCatalogRouter.delete("/titles/:id", async (req, res) => {
  await loadTitle(req.params.id);
  if (await prisma.ticket.count({ where: { titleId: req.params.id } })) {
    throw new HttpError(409, "has_tickets", "People have tickets for this title. Unpublish it instead of deleting.");
  }
  await prisma.title.delete({ where: { id: req.params.id } });
  catalogChanged();
  res.status(204).end();
});

/** Genre names for the editor's suggestions. */
adminCatalogRouter.get("/genres", async (_req, res) => {
  const genres = await prisma.genre.findMany({ orderBy: { name: "asc" } });
  res.json(genres.map((g) => g.name));
});

// ── Seasons & episodes ──────────────────────────────────────────────────────

adminCatalogRouter.post("/titles/:id/seasons", async (req, res) => {
  const input = seasonInputSchema.parse(req.body);
  const title = await loadTitle(req.params.id);
  if (title.type !== "SERIES") throw new HttpError(400, "not_a_series", "Only series have seasons");
  await unique(prisma.season.create({ data: { ...input, titleId: title.id } }), `Season ${input.number} already exists`);
  catalogChanged();
  res.status(201).json(await toAdminTitle(await loadTitle(title.id)));
});

adminCatalogRouter.patch("/seasons/:id", async (req, res) => {
  const input = seasonUpdateSchema.parse(req.body);
  const season = await prisma.season.findUnique({ where: { id: req.params.id } });
  if (!season) throw notFound("Season");
  await unique(prisma.season.update({ where: { id: season.id }, data: input }), `Season ${input.number} already exists`);
  catalogChanged();
  res.json(await toAdminTitle(await loadTitle(season.titleId)));
});

adminCatalogRouter.delete("/seasons/:id", async (req, res) => {
  const season = await prisma.season.findUnique({ where: { id: req.params.id } });
  if (!season) throw notFound("Season");
  await prisma.season.delete({ where: { id: season.id } });
  catalogChanged();
  res.json(await toAdminTitle(await loadTitle(season.titleId)));
});

adminCatalogRouter.post("/seasons/:id/episodes", async (req, res) => {
  const input = episodeInputSchema.parse(req.body);
  const season = await prisma.season.findUnique({ where: { id: req.params.id } });
  if (!season) throw notFound("Season");
  await unique(prisma.episode.create({ data: { ...input, seasonId: season.id } }), `Episode ${input.number} already exists`);
  catalogChanged();
  res.status(201).json(await toAdminTitle(await loadTitle(season.titleId)));
});

adminCatalogRouter.patch("/episodes/:id", async (req, res) => {
  const input = episodeUpdateSchema.parse(req.body);
  const episode = await prisma.episode.findUnique({ where: { id: req.params.id }, include: { season: true } });
  if (!episode) throw notFound("Episode");
  await unique(prisma.episode.update({ where: { id: episode.id }, data: input }), `Episode ${input.number} already exists`);
  catalogChanged();
  res.json(await toAdminTitle(await loadTitle(episode.season.titleId)));
});

adminCatalogRouter.delete("/episodes/:id", async (req, res) => {
  const episode = await prisma.episode.findUnique({ where: { id: req.params.id }, include: { season: true } });
  if (!episode) throw notFound("Episode");
  await prisma.episode.delete({ where: { id: episode.id } });
  catalogChanged();
  res.json(await toAdminTitle(await loadTitle(episode.season.titleId)));
});

// ── Artwork ─────────────────────────────────────────────────────────────────

/** POST /admin/uploads?kind=poster with the image as the raw body. Returns { url }. */
adminCatalogRouter.post(
  "/uploads",
  express.raw({ type: Object.keys(IMAGE_TYPES), limit: "8mb" }),
  async (req, res) => {
    const { kind } = uploadKindSchema.parse(req.query);
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      throw new HttpError(415, "unsupported_type", "Upload a JPEG, PNG, WebP or AVIF image");
    }
    const url = await saveImage(kind, req.body, req.get("content-type")!.split(";")[0]!.trim());
    res.status(201).json({ url });
  },
);

// ── Subtitles ───────────────────────────────────────────────────────────────

async function movieSlug(id: string) {
  const title = await loadTitle(id);
  if (title.type !== "MOVIE") throw new HttpError(400, "not_a_movie", "Subtitles are added to films");
  return title.slug;
}

adminCatalogRouter.get("/titles/:id/subtitles", async (req, res) => {
  res.json(await listSubtitles(await movieSlug(req.params.id)));
});

/** PUT with the .srt or .vtt text as the body. Adds the language or replaces it. */
adminCatalogRouter.put("/titles/:id/subtitles/:lang", express.text({ type: () => true, limit: "2mb" }), async (req, res) => {
  const lang = subtitleLangSchema.parse(req.params.lang);
  const slug = await movieSlug(req.params.id);
  if (typeof req.body !== "string" || !req.body.trim()) throw new HttpError(400, "bad_subtitles", "Upload a subtitle file");
  res.json(await putSubtitle(slug, lang, req.body));
});

adminCatalogRouter.delete("/titles/:id/subtitles/:lang", async (req, res) => {
  const lang = subtitleLangSchema.parse(req.params.lang);
  res.json(await removeSubtitle(await movieSlug(req.params.id), lang));
});
