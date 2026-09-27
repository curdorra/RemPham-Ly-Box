import { Router } from "express";
import type { ContinueWatchingItem } from "@ott/shared";
import { progressSchema } from "@ott/shared";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { titleSummaryInclude, toEpisode, toTitleSummary } from "../lib/serialize.js";
import { requireAuth } from "../middleware/auth.js";

export const meRouter = Router();
meRouter.use(requireAuth);

/** A title counts as finished once the viewer is within this share of the end. */
const COMPLETION_RATIO = 0.95;

meRouter.get("/list", async (req, res) => {
  const items = await prisma.myListItem.findMany({
    where: { userId: req.userId!, title: { published: true } },
    include: { title: { include: titleSummaryInclude } },
    orderBy: { createdAt: "desc" },
  });
  res.json(items.map((i) => toTitleSummary(i.title)));
});

meRouter.put("/list/:titleId", async (req, res) => {
  const title = await prisma.title.findFirst({ where: { id: req.params.titleId, published: true } });
  if (!title) throw notFound("Title");
  await prisma.myListItem.upsert({
    where: { userId_titleId: { userId: req.userId!, titleId: title.id } },
    create: { userId: req.userId!, titleId: title.id },
    update: {},
  });
  res.status(204).end();
});

meRouter.delete("/list/:titleId", async (req, res) => {
  await prisma.myListItem.deleteMany({ where: { userId: req.userId!, titleId: req.params.titleId } });
  res.status(204).end();
});

meRouter.put("/progress", async (req, res) => {
  const input = progressSchema.parse(req.body);
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
    where: { userId_mediaId: { userId: req.userId!, mediaId } },
    create: { userId: req.userId!, titleId: input.titleId, episodeId, mediaId, ...data },
    update: data,
  });
  res.status(204).end();
});

meRouter.get("/continue-watching", async (req, res) => {
  const rows = await prisma.watchProgress.findMany({
    where: { userId: req.userId!, completed: false, positionSec: { gt: 0 }, title: { published: true } },
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
