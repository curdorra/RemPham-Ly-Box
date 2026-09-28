import { Router } from "express";
import type { ContinueWatchingItem } from "@ott/shared";
import { progressSchema, ratingSchema } from "@ott/shared";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { currentProfile, visibleTitles } from "../lib/profiles.js";
import { titleSummaryInclude, toEpisode, toTitleSummary } from "../lib/serialize.js";
import { requireAuth } from "../middleware/auth.js";

export const meRouter = Router();
meRouter.use(requireAuth);

/** A title counts as finished once the viewer is within this share of the end. */
const COMPLETION_RATIO = 0.95;

meRouter.get("/list", async (req, res) => {
  const profile = await currentProfile(req);
  const items = await prisma.myListItem.findMany({
    where: { profileId: profile.id, title: await visibleTitles(req) },
    include: { title: { include: titleSummaryInclude } },
    orderBy: { createdAt: "desc" },
  });
  res.json(items.map((i) => toTitleSummary(i.title)));
});

meRouter.put("/list/:titleId", async (req, res) => {
  const profile = await currentProfile(req);
  const title = await prisma.title.findFirst({ where: { ...(await visibleTitles(req)), id: req.params.titleId } });
  if (!title) throw notFound("Title");
  await prisma.myListItem.upsert({
    where: { profileId_titleId: { profileId: profile.id, titleId: title.id } },
    create: { profileId: profile.id, titleId: title.id },
    update: {},
  });
  res.status(204).end();
});

meRouter.delete("/list/:titleId", async (req, res) => {
  const profile = await currentProfile(req);
  await prisma.myListItem.deleteMany({ where: { profileId: profile.id, titleId: req.params.titleId } });
  res.status(204).end();
});

meRouter.put("/progress", async (req, res) => {
  const input = progressSchema.parse(req.body);
  const profile = await currentProfile(req);
  const episodeId = input.episodeId ?? null;

  if (episodeId) {
    const ep = await prisma.episode.findFirst({ where: { id: episodeId, season: { titleId: input.titleId } } });
    if (!ep) throw notFound("Episode");
  } else {
    const title = await prisma.title.findUnique({ where: { id: input.titleId } });
    if (!title) throw notFound("Title");
    if (title.type === "SERIES") throw new HttpError(400, "episode_required", "episodeId is required for series");
  }

  const positionSec = Math.min(input.positionSec, input.durationSec);
  const completed = positionSec >= input.durationSec * COMPLETION_RATIO;
  const mediaId = episodeId ?? input.titleId;
  const data = { positionSec, durationSec: input.durationSec, completed };

  await prisma.watchProgress.upsert({
    where: { profileId_mediaId: { profileId: profile.id, mediaId } },
    create: { profileId: profile.id, titleId: input.titleId, episodeId, mediaId, ...data },
    update: data,
  });
  res.status(204).end();
});

meRouter.get("/continue-watching", async (req, res) => {
  const profile = await currentProfile(req);
  const rows = await prisma.watchProgress.findMany({
    where: { profileId: profile.id, completed: false, positionSec: { gt: 0 }, title: await visibleTitles(req) },
    include: { title: { include: titleSummaryInclude }, episode: { include: { season: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  // Only the most recently watched episode per series.
  const seen = new Set<string>();
  const items: ContinueWatchingItem[] = [];
  for (const row of rows) {
    if (seen.has(row.titleId)) continue;
    seen.add(row.titleId);
    items.push({
      title: toTitleSummary(row.title),
      episode: row.episode ? { ...toEpisode(row.episode), seasonNumber: row.episode.season.number } : null,
      positionSec: row.positionSec,
      durationSec: row.durationSec,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  res.json(items.slice(0, 20));
});

/** Thumbs up/down/love. Feeds recommendations. */
meRouter.put("/ratings/:titleId", async (req, res) => {
  const { value } = ratingSchema.parse(req.body);
  const profile = await currentProfile(req);
  const title = await prisma.title.findFirst({ where: { ...(await visibleTitles(req)), id: req.params.titleId } });
  if (!title) throw notFound("Title");
  await prisma.rating.upsert({
    where: { profileId_titleId: { profileId: profile.id, titleId: title.id } },
    create: { profileId: profile.id, titleId: title.id, value },
    update: { value },
  });
  res.status(204).end();
});

meRouter.delete("/ratings/:titleId", async (req, res) => {
  const profile = await currentProfile(req);
  await prisma.rating.deleteMany({ where: { profileId: profile.id, titleId: req.params.titleId } });
  res.status(204).end();
});

/** Everything this profile has watched, most recent first ("Watch it again"). */
meRouter.get("/history", async (req, res) => {
  const profile = await currentProfile(req);
  const rows = await prisma.watchProgress.findMany({
    where: { profileId: profile.id, title: await visibleTitles(req) },
    include: { title: { include: titleSummaryInclude } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const seen = new Set<string>();
  const items = rows
    .filter((r) => !seen.has(r.titleId) && !!seen.add(r.titleId))
    .map((r) => ({ title: toTitleSummary(r.title), lastWatchedAt: r.updatedAt.toISOString(), completed: r.completed }));
  res.json(items);
});
