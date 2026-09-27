import { Router } from "express";
import type { PlaybackInfo } from "@ott/shared";
import { playbackRequestSchema } from "@ott/shared";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { signManifestUrl } from "../lib/playback.js";
import { titleSummaryInclude, toEpisode, toTitleSummary } from "../lib/serialize.js";
import { requireAuth, requireSubscription } from "../middleware/auth.js";

export const playbackRouter = Router();

/**
 * Issues a playback grant for a movie or an episode. This is the single
 * entitlement check: the client never learns a manifest URL without it.
 */
playbackRouter.post("/", requireAuth, requireSubscription, async (req, res) => {
  const input = playbackRequestSchema.parse(req.body);
  const title = await prisma.title.findFirst({
    where: { id: input.titleId, published: true },
    include: {
      ...titleSummaryInclude,
      seasons: { orderBy: { number: "asc" }, include: { episodes: { orderBy: { number: "asc" } } } },
    },
  });
  if (!title) throw notFound("Title");

  let manifestUrl: string;
  let episode: PlaybackInfo["episode"] = null;
  let nextEpisodeId: string | null = null;
  let mediaId = title.id;

  if (title.type === "SERIES") {
    const ordered = title.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, seasonNumber: s.number })));
    const idx = input.episodeId ? ordered.findIndex((e) => e.id === input.episodeId) : 0;
    const ep = ordered[idx];
    if (!ep) throw notFound("Episode");
    manifestUrl = ep.manifestUrl;
    episode = { ...toEpisode(ep), seasonNumber: ep.seasonNumber };
    nextEpisodeId = ordered[idx + 1]?.id ?? null;
    mediaId = ep.id;
  } else {
    if (!title.manifestUrl) throw new HttpError(409, "not_available", "This title is not available yet");
    manifestUrl = title.manifestUrl;
  }

  const progress = await prisma.watchProgress.findUnique({
    where: { userId_mediaId: { userId: req.userId!, mediaId } },
  });
  const signed = signManifestUrl(manifestUrl);

  const info: PlaybackInfo = {
    manifestUrl: signed.url,
    expiresAt: signed.expiresAt.toISOString(),
    resumeFromSec: progress && !progress.completed ? progress.positionSec : 0,
    title: toTitleSummary(title),
    episode,
    nextEpisodeId,
  };
  res.json(info);
});
