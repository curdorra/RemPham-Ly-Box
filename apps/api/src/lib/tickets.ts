import { TICKET_TIERS } from "@ott/shared";
import type { Ticket as TicketDto, TicketState } from "@ott/shared";
import type { Genre, Order, Screening, Ticket, Title } from "../generated/prisma/client.js";
import { toTitleSummary } from "./serialize.js";

/** Late joiners can still get in this long after an opening night's runtime. */
export const LIVE_GRACE_MS = 15 * 60 * 1000;
/** Runtime assumed for a screening whose title has no duration. */
const FALLBACK_RUNTIME_SEC = 3 * 60 * 60;
/** A playback session without a heartbeat for this long frees its screen. */
export const SESSION_STALE_MS = 90 * 1000;

export const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function liveEndsAt(screening: Pick<Screening, "startsAt">, title: Pick<Title, "durationSec">) {
  const runtimeMs = (title.durationSec ?? FALLBACK_RUNTIME_SEC) * 1000;
  return new Date(screening.startsAt.getTime() + runtimeMs + LIVE_GRACE_MS);
}

export function screeningState(screening: Pick<Screening, "startsAt">, title: Pick<Title, "durationSec">, now = new Date()) {
  if (now < screening.startsAt) return "UPCOMING" as const;
  if (now < liveEndsAt(screening, title)) return "LIVE" as const;
  return "ENDED" as const;
}

/** Hours of on-demand viewing a ticket gives once first played. */
export function windowHours(title: Pick<Title, "rentalHours">, tier: Ticket["tier"]) {
  return title.rentalHours + TICKET_TIERS[tier].extraHours;
}

type TicketWithTitle = Ticket & { title: Title; screening: Screening | null };

/**
 * Opening-night tickets are UPCOMING, then LIVE; after the screening they turn
 * into ordinary on-demand tickets (READY → ACTIVE → EXPIRED). Watching live
 * never starts the on-demand window.
 */
export function ticketState(t: TicketWithTitle, now = new Date()): TicketState {
  if (t.screening) {
    const s = screeningState(t.screening, t.title, now);
    if (s === "UPCOMING") return "UPCOMING";
    if (s === "LIVE") return "LIVE";
  }
  if (!t.firstPlayedAt) return "READY";
  return t.expiresAt && t.expiresAt > now ? "ACTIVE" : "EXPIRED";
}

const PREFERENCE: TicketState[] = ["LIVE", "ACTIVE", "READY"];

/** Picks the best ticket to play with: live first, then a running window, then a fresh one. */
export function pickPlayableTicket<T extends TicketWithTitle>(tickets: T[], now = new Date()) {
  let best: { ticket: T; state: TicketState } | null = null;
  for (const ticket of tickets) {
    const state = ticketState(ticket, now);
    const rank = PREFERENCE.indexOf(state);
    if (rank === -1) continue;
    if (!best || rank < PREFERENCE.indexOf(best.state)) best = { ticket, state };
  }
  return best;
}

export const ticketInclude = {
  title: { include: { genres: { orderBy: { name: "asc" } } } },
  screening: true,
  order: true,
} as const;

export function toTicket(
  t: Ticket & { title: Title & { genres: Genre[] }; screening: Screening | null; order: Order },
  viewerId: string,
  now = new Date(),
): TicketDto {
  const isGiftForOthers = !t.holderId && t.order.userId === viewerId;
  return {
    id: t.id,
    title: toTitleSummary(t.title),
    tier: t.tier,
    screens: TICKET_TIERS[t.tier].screens,
    state: ticketState(t, now),
    screening: t.screening && { id: t.screening.id, startsAt: t.screening.startsAt.toISOString() },
    seat: t.seat,
    firstPlayedAt: t.firstPlayedAt?.toISOString() ?? null,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    orderId: t.orderId,
    giftCode: isGiftForOthers ? t.giftCode : null,
    isGiftForOthers,
  };
}
