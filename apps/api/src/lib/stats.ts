import type { AdminStats, StatsRangeInput, TicketTier } from "@ott/shared";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { SESSION_STALE_MS } from "./tickets.js";

const IST = "+05:30";
const DAY_MS = 86400_000;
const DROP_STEPS = 10;
const num = (v: unknown) => Number(v ?? 0);

/** The window as instants. Custom days run midnight to midnight India time. */
export function statsWindow(q: StatsRangeInput, now = new Date()): { from: Date; to: Date } {
  if (q.from && q.to) return { from: new Date(`${q.from}T00:00:00.000${IST}`), to: new Date(`${q.to}T23:59:59.999${IST}`) };
  return { from: new Date(now.getTime() - (q.days ?? 30) * DAY_MS), to: now };
}

/** India-time calendar day of an instant, as YYYY-MM-DD. */
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

const paid = (from: Date, to: Date) => ({ status: "PAID" as const, paidAt: { gte: from, lte: to } });

export async function adminStats(q: StatsRangeInput): Promise<AdminStats> {
  const now = new Date();
  const { from, to } = statsWindow(q, now);
  const live = new Date(now.getTime() - SESSION_STALE_MS);

  const dropCols = Prisma.raw(
    Array.from(
      { length: DROP_STEPS },
      (_, i) => `count(*) FILTER (WHERE completed OR "positionSec" * ${DROP_STEPS} >= ${i + 1} * "durationSec") AS r${i + 1}`,
    ).join(", "),
  );

  const [byTitleRaw, byTier, byDayRaw, snack, gifts, signUps, buyersRaw, watchRows, watchTotal, viewersNow, screenings, joined, ratingRows] =
    await Promise.all([
      prisma.ticket.groupBy({ by: ["titleId"], where: { order: paid(from, to) }, _count: { _all: true }, _sum: { pricePaise: true } }),
      prisma.ticket.groupBy({ by: ["tier"], where: { order: paid(from, to) }, _count: { _all: true }, _sum: { pricePaise: true } }),
      prisma.$queryRaw<{ day: string; tickets: bigint; gross: bigint }[]>`
        SELECT to_char((o."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               count(t.id) AS tickets, coalesce(sum(t."pricePaise"), 0) AS gross
        FROM "Ticket" t JOIN "Order" o ON o.id = t."orderId"
        WHERE o.status = 'PAID' AND o."paidAt" >= ${from} AND o."paidAt" <= ${to}
        GROUP BY 1`,
      prisma.$queryRaw<{ paise: bigint; orders: bigint }[]>`
        SELECT coalesce(sum(l."unitPaise" * l.qty), 0) AS paise, count(DISTINCT so.id) AS orders
        FROM "SnackOrderLine" l
        JOIN "SnackOrder" so ON so.id = l."snackOrderId"
        JOIN "Order" o ON o.id = so."orderId"
        WHERE o.status = 'PAID' AND o."paidAt" >= ${from} AND o."paidAt" <= ${to} AND so.status <> 'CANCELED'`,
      prisma.$queryRaw<{ issued: bigint; redeemed: bigint }[]>`
        SELECT count(*) AS issued, count(*) FILTER (WHERE t."holderId" IS NOT NULL) AS redeemed
        FROM "Ticket" t JOIN "Order" o ON o.id = t."orderId"
        WHERE t."giftCode" IS NOT NULL AND o.status = 'PAID' AND o."paidAt" >= ${from} AND o."paidAt" <= ${to}`,
      prisma.user.count({ where: { createdAt: { gte: from, lte: to } } }),
      // Buyers in the window, and how many of them have paid for 2+ orders so far.
      prisma.$queryRaw<{ buyers: bigint; repeat: bigint }[]>`
        WITH b AS (SELECT DISTINCT o."userId" FROM "Order" o WHERE o.status = 'PAID' AND o."paidAt" >= ${from} AND o."paidAt" <= ${to})
        SELECT count(*) AS buyers,
               count(*) FILTER (WHERE (SELECT count(*) FROM "Order" x WHERE x."userId" = b."userId" AND x.status = 'PAID' AND x."paidAt" <= ${to}) >= 2) AS repeat
        FROM b`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT "titleId", count(DISTINCT "profileId") AS viewers, avg("positionSec") AS avg_sec,
               avg(CASE WHEN completed THEN 1 ELSE 0 END) AS completion, ${dropCols}, count(*) AS n
        FROM "WatchProgress"
        WHERE "updatedAt" >= ${from} AND "updatedAt" <= ${to} AND "durationSec" > 0
        GROUP BY "titleId"`,
      prisma.watchProgress.aggregate({
        where: { updatedAt: { gte: from, lte: to }, durationSec: { gt: 0 } },
        _avg: { positionSec: true },
        _count: { _all: true },
      }),
      prisma.playbackSession.count({ where: { lastSeenAt: { gt: live } } }),
      // Upcoming nights and those inside the window.
      prisma.screening.findMany({
        where: { startsAt: { gte: from } },
        orderBy: { startsAt: "asc" },
        take: 50,
        include: { title: { select: { name: true } }, _count: { select: { tickets: { where: { order: { status: "PAID" } } } } } },
      }),
      prisma.playbackSession.groupBy({
        by: ["ticketId"],
        where: { lastSeenAt: { gt: live }, ticket: { screeningId: { not: null } } },
        _count: { _all: true },
      }),
      prisma.rating.groupBy({ by: ["titleId", "value"], _count: { _all: true } }),
    ]);

  const completed = await prisma.watchProgress.count({
    where: { updatedAt: { gte: from, lte: to }, durationSec: { gt: 0 }, completed: true },
  });

  const titleIds = [
    ...new Set([...byTitleRaw.map((g) => g.titleId), ...watchRows.map((r) => String(r.titleId)), ...ratingRows.map((r) => r.titleId)]),
  ];
  const names = new Map((await prisma.title.findMany({ where: { id: { in: titleIds } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  const nameOf = (id: string) => names.get(id) ?? "(deleted title)";

  const tally = new Map<string, { disliked: number; liked: number; loved: number }>();
  for (const r of ratingRows) {
    const t = tally.get(r.titleId) ?? { disliked: 0, liked: 0, loved: 0 };
    t[r.value === -1 ? "disliked" : r.value === 2 ? "loved" : "liked"] += r._count._all;
    tally.set(r.titleId, t);
  }
  const ratings = [...tally].map(([titleId, t]) => {
    const count = t.disliked + t.liked + t.loved;
    return { titleId, name: nameOf(titleId), ...t, count, approval: Math.round(((t.liked + t.loved) / count) * 100) / 100 };
  });

  const days = new Map(byDayRaw.map((r) => [r.day, r]));
  const byDay: AdminStats["money"]["byDay"] = [];
  for (let t = Date.parse(`${istDay(from)}T00:00:00Z`); t <= Date.parse(`${istDay(to)}T00:00:00Z`); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    const r = days.get(day);
    byDay.push({ day, tickets: num(r?.tickets), grossPaise: num(r?.gross) });
  }

  const joinedTickets = joined.length
    ? await prisma.ticket.findMany({
        where: { id: { in: joined.map((j) => j.ticketId) } },
        select: { id: true, screeningId: true },
      })
    : [];
  const screeningOf = new Map(joinedTickets.map((t) => [t.id, t.screeningId]));
  const joinedBy = new Map<string, number>();
  for (const j of joined) {
    const s = screeningOf.get(j.ticketId);
    if (s) joinedBy.set(s, (joinedBy.get(s) ?? 0) + j._count._all);
  }

  const money = byTitleRaw.map((g) => ({ titleId: g.titleId, name: nameOf(g.titleId), tickets: g._count._all, grossPaise: g._sum.pricePaise ?? 0 }));
  const sumGross = money.reduce((s, m) => s + m.grossPaise, 0);
  const sumTickets = money.reduce((s, m) => s + m.tickets, 0);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    money: {
      grossPaise: sumGross,
      tickets: sumTickets,
      byTitle: money.sort((a, b) => b.grossPaise - a.grossPaise),
      byDay,
      byTier: (byTier as { tier: TicketTier; _count: { _all: number }; _sum: { pricePaise: number | null } }[]).map((g) => ({
        tier: g.tier,
        tickets: g._count._all,
        grossPaise: g._sum.pricePaise ?? 0,
      })),
      snackPaise: num(snack[0]?.paise),
      snackOrders: num(snack[0]?.orders),
      giftsIssued: num(gifts[0]?.issued),
      giftsRedeemed: num(gifts[0]?.redeemed),
    },
    audience: { signUps, buyers: num(buyersRaw[0]?.buyers), repeatBuyers: num(buyersRaw[0]?.repeat) },
    watching: {
      viewersNow,
      avgWatchSec: Math.round(watchTotal._avg.positionSec ?? 0),
      completionRate: watchTotal._count._all ? completed / watchTotal._count._all : 0,
      byTitle: watchRows
        .map((r) => ({
          titleId: String(r.titleId),
          name: nameOf(String(r.titleId)),
          viewers: num(r.viewers),
          avgWatchSec: Math.round(num(r.avg_sec)),
          completionRate: num(r.completion),
          dropOff: Array.from({ length: DROP_STEPS }, (_, i) => num(r[`r${i + 1}`]) / Math.max(1, num(r.n))),
        }))
        .sort((a, b) => b.viewers - a.viewers),
    },
    openingNights: screenings.map((s) => ({
      id: s.id,
      titleId: s.titleId,
      name: s.title.name,
      startsAt: s.startsAt.toISOString(),
      sold: s._count.tickets,
      capacity: s.rows * s.seatsPerRow,
      joinedNow: joinedBy.get(s.id) ?? 0,
    })),
    ratings: ratings.sort((a, b) => b.approval - a.approval || b.count - a.count),
  };
}
