import { Router } from "express";
import { TICKET_TIERS, heartbeatSchema, playbackRequestSchema } from "@ott/shared";
import type { PlaybackInfo } from "@ott/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { filmKey } from "../lib/film-keys.js";
import { manifestDir, signManifestUrl } from "../lib/playback.js";
import { currentProfile, visibleTitles } from "../lib/profiles.js";
import { titleSummaryInclude, toEpisode, toTitleSummary } from "../lib/serialize.js";
import { SESSION_STALE_MS, pickPlayableTicket, ticketState, windowHours } from "../lib/tickets.js";
import { requireAuth } from "../middleware/auth.js";

export const playbackRouter = Router();
playbackRouter.use(requireAuth);

const heldTicketsInclude = { title: true, screening: true } as const;

/**
 * Claims a screen for (ticket, device). Fails when the tier's other screens are
 * all in use by devices that sent a heartbeat recently.
 */
async function claimScreen(tx: Prisma.TransactionClient, ticketId: string, screens: number, deviceId: string, now: Date) {
  const others = await tx.playbackSession.count({
    where: { ticketId, deviceId: { not: deviceId }, lastSeenAt: { gt: new Date(now.getTime() - SESSION_STALE_MS) } },
  });
  if (others >= screens) {
    throw new HttpError(
      409,
      "too_many_screens",
      screens === 1
        ? "This ticket is already playing on another screen"
        : `This ticket is already playing on ${screens} screens`,
    );
  }
  await tx.playbackSession.upsert({
    where: { ticketId_deviceId: { ticketId, deviceId } },
    create: { ticketId, deviceId, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
}

/**
 * Issues a playback grant for a movie or an episode. This is the single
 * entitlement check: the client never learns a manifest URL without it.
 */
playbackRouter.post("/", async (req, res) => {
  const input = playbackRequestSchema.parse(req.body);
  const now = new Date();
  const profile = await currentProfile(req);
  const title = await prisma.title.findFirst({
    where: { ...(await visibleTitles(req)), id: input.titleId },
    include: {
      ...titleSummaryInclude,
      seasons: { orderBy: { number: "asc" }, include: { episodes: { orderBy: { number: "asc" } } } },
    },
  });
  if (!title) throw notFound("Title");

  const held = await prisma.ticket.findMany({
    where: { holderId: req.userId!, titleId: title.id, order: { status: "PAID" } },
    include: heldTicketsInclude,
  });
  const pick = pickPlayableTicket(held, now);
  if (!pick) {
    const upcoming = held.find((t) => ticketState(t, now) === "UPCOMING");
    if (upcoming?.screening) {
      throw new HttpError(409, "premiere_not_started", "Opening night hasn't started yet", {
        startsAt: upcoming.screening.startsAt.toISOString(),
      });
    }
    const expired = held.length > 0;
    throw new HttpError(
      402,
      "ticket_required",
      expired ? "Your ticket for this title has expired" : "Get a ticket to watch this title",
    );
  }
  let { ticket } = pick;
  const live = pick.state === "LIVE" && ticket.screening ? ticket.screening : null;

  let manifestUrl: string;
  let episode: PlaybackInfo["episode"] = null;
  let nextEpisodeId: string | null = null;
  let mediaId = title.id;
  let markers: PlaybackInfo["markers"] = {
    introStartSec: title.introStartSec,
    introEndSec: title.introEndSec,
    creditsStartSec: title.creditsStartSec,
  };

  if (title.type === "SERIES") {
    const ordered = title.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, seasonNumber: s.number })));
    const idx = input.episodeId ? ordered.findIndex((e) => e.id === input.episodeId) : 0;
    const ep = ordered[idx];
    if (!ep) throw notFound("Episode");
    manifestUrl = ep.manifestUrl;
    episode = { ...toEpisode(ep), seasonNumber: ep.seasonNumber };
    nextEpisodeId = ordered[idx + 1]?.id ?? null;
    mediaId = ep.id;
    markers = { introStartSec: ep.introStartSec, introEndSec: ep.introEndSec, creditsStartSec: ep.creditsStartSec };
  } else {
    if (!title.manifestUrl) throw new HttpError(409, "not_available", "This title is not available yet");
    manifestUrl = title.manifestUrl;
  }

  const screens = TICKET_TIERS[ticket.tier].screens;
  await prisma.$transaction(async (tx) => {
    await claimScreen(tx, ticket.id, screens, input.deviceId, now);
    // First on-demand play starts the rental window (watching live never does).
    if (pick.state === "READY") {
      const expiresAt = new Date(now.getTime() + windowHours(title, ticket.tier) * 3600 * 1000);
      await tx.ticket.updateMany({ where: { id: ticket.id, firstPlayedAt: null }, data: { firstPlayedAt: now, expiresAt } });
      ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id }, include: heldTicketsInclude });
    }
  });

  const progress = await prisma.watchProgress.findUnique({
    where: { profileId_mediaId: { profileId: profile.id, mediaId } },
  });
  const signed = signManifestUrl(manifestUrl, now.getTime());
  const offsetSec = live ? Math.max(0, Math.floor((now.getTime() - live.startsAt.getTime()) / 1000)) : 0;

  const info: PlaybackInfo = {
    manifestUrl: signed.url,
    expiresAt: signed.expiresAt.toISOString(),
    resumeFromSec: live ? offsetSec : progress && !progress.completed ? progress.positionSec : 0,
    title: toTitleSummary(title),
    episode,
    nextEpisodeId,
    markers,
    ticket: { id: ticket.id, tier: ticket.tier, screens, expiresAt: ticket.expiresAt?.toISOString() ?? null },
    live: live && { screeningId: live.id, startsAt: live.startsAt.toISOString(), offsetSec },
  };
  res.json(info);
});

async function heldTicket(ticketId: string, userId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, holderId: userId, order: { status: "PAID" } },
    include: heldTicketsInclude,
  });
  if (!ticket) throw notFound("Ticket");
  return ticket;
}

/** Players call this every ~30s to keep their screen. */
playbackRouter.post("/heartbeat", async (req, res) => {
  const input = heartbeatSchema.parse(req.body);
  const now = new Date();
  const ticket = await heldTicket(input.ticketId, req.userId!);
  const state = ticketState(ticket, now);
  if (state !== "LIVE" && state !== "ACTIVE") {
    throw new HttpError(402, "ticket_required", "Your ticket for this title has expired");
  }
  await prisma.$transaction((tx) => claimScreen(tx, ticket.id, TICKET_TIERS[ticket.tier].screens, input.deviceId, now));
  res.json({ ok: true, expiresAt: ticket.expiresAt?.toISOString() ?? null });
});

/**
 * The AES-128 key for an encrypted film, for a viewer who is watching it right
 * now: a held ticket that's live or running, with a screen that sent a recent
 * heartbeat. Players fetch it through the web's /api proxy (the Worker writes
 * that URL into the playlist), so the login cookie comes along and a copied
 * playlist link alone can't decrypt the segments.
 */
playbackRouter.get("/key", async (req, res) => {
  if (!config.CONTENT_KEY_SECRET) throw new HttpError(503, "keys_unavailable", "Playback is not configured");
  const dir = typeof req.query.dir === "string" ? req.query.dir : "";
  if (!/^\/films\/(?:[\w-]+\/)+$/.test(dir)) throw notFound("Film");

  const where = { manifestUrl: { contains: dir } };
  const [titles, episodes] = await Promise.all([
    prisma.title.findMany({ where, select: { id: true, manifestUrl: true } }),
    prisma.episode.findMany({ where, select: { manifestUrl: true, season: { select: { titleId: true } } } }),
  ]);
  const titleIds = [
    ...titles.map((t) => ({ id: t.id, url: t.manifestUrl })),
    ...episodes.map((e) => ({ id: e.season.titleId, url: e.manifestUrl })),
  ]
    .filter((m) => m.url && manifestDir(m.url) === dir)
    .map((m) => m.id);
  if (!titleIds.length) throw notFound("Film");

  const now = new Date();
  const watching = await prisma.ticket.findMany({
    where: {
      holderId: req.userId!,
      titleId: { in: titleIds },
      order: { status: "PAID" },
      sessions: { some: { lastSeenAt: { gt: new Date(now.getTime() - SESSION_STALE_MS) } } },
    },
    include: heldTicketsInclude,
  });
  if (!watching.some((t) => ["LIVE", "ACTIVE"].includes(ticketState(t, now)))) {
    throw new HttpError(403, "not_watching", "Reopen the film to keep watching");
  }

  res.set("cache-control", "private, no-store");
  res.type("application/octet-stream").send(filmKey(config.CONTENT_KEY_SECRET, dir));
});

/** Frees the screen straight away when a player closes. */
playbackRouter.post("/release", async (req, res) => {
  const input = heartbeatSchema.parse(req.body);
  await heldTicket(input.ticketId, req.userId!);
  await prisma.playbackSession.deleteMany({ where: { ticketId: input.ticketId, deviceId: input.deviceId } });
  res.status(204).end();
});
