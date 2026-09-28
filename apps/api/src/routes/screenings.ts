import { Router } from "express";
import type { ScreeningDetail, ScreeningSummary } from "@ott/shared";
import type { Genre, Screening, Title } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { expireStaleOrders, takenSeats } from "../lib/orders.js";
import { titleSummaryInclude, toTitleSummary } from "../lib/serialize.js";
import { ROW_LETTERS, liveEndsAt, screeningState } from "../lib/tickets.js";
import { requireAuth } from "../middleware/auth.js";

export const screeningsRouter = Router();

const include = { title: { include: titleSummaryInclude } } as const;
/** Longest runtime we look back over when deciding what is still live. */
const LOOKBACK_MS = 8 * 60 * 60 * 1000;

async function summary(s: Screening & { title: Title & { genres: Genre[] } }, userId?: string, now = new Date()) {
  const [taken, reminder] = await Promise.all([
    takenSeats(prisma, s.id),
    userId ? prisma.reminder.findUnique({ where: { userId_screeningId: { userId, screeningId: s.id } } }) : null,
  ]);
  const result: ScreeningSummary = {
    id: s.id,
    title: toTitleSummary(s.title),
    startsAt: s.startsAt.toISOString(),
    pricePaise: s.pricePaise ?? s.title.pricePaise,
    capacity: s.rows * s.seatsPerRow,
    seatsTaken: taken.size,
    state: screeningState(s, s.title, now),
    reminded: !!reminder,
  };
  return { result, taken };
}

/** Opening nights that are coming up or playing right now. */
screeningsRouter.get("/", async (req, res) => {
  const now = new Date();
  await expireStaleOrders(prisma, now);
  const rows = await prisma.screening.findMany({
    where: { startsAt: { gt: new Date(now.getTime() - LOOKBACK_MS) }, title: { published: true } },
    include,
    orderBy: { startsAt: "asc" },
  });
  const live = rows.filter((s) => liveEndsAt(s, s.title) > now);
  res.json(await Promise.all(live.map(async (s) => (await summary(s, req.userId, now)).result)));
});

screeningsRouter.get("/:id", async (req, res) => {
  const now = new Date();
  await expireStaleOrders(prisma, now);
  const s = await prisma.screening.findFirst({ where: { id: req.params.id, title: { published: true } }, include });
  if (!s) throw notFound("Screening");
  const { result, taken } = await summary(s, req.userId, now);
  const mine = req.userId
    ? await prisma.ticket.findMany({
        where: { screeningId: s.id, holderId: req.userId, seat: { not: null }, order: { status: "PAID" } },
        select: { seat: true },
      })
    : [];
  const detail: ScreeningDetail = {
    ...result,
    layout: { rows: [...ROW_LETTERS.slice(0, s.rows)], seatsPerRow: s.seatsPerRow, aisleAfter: s.aisleAfter },
    takenSeats: [...taken].sort(),
    mySeats: mine.map((t) => t.seat!).sort(),
  };
  res.json(detail);
});

screeningsRouter.put("/:id/reminder", requireAuth, async (req, res) => {
  const s = await prisma.screening.findUnique({ where: { id: String(req.params.id) } });
  if (!s) throw notFound("Screening");
  await prisma.reminder.upsert({
    where: { userId_screeningId: { userId: req.userId!, screeningId: s.id } },
    create: { userId: req.userId!, screeningId: s.id },
    update: {},
  });
  res.status(204).end();
});

screeningsRouter.delete("/:id/reminder", requireAuth, async (req, res) => {
  await prisma.reminder.deleteMany({ where: { userId: req.userId!, screeningId: String(req.params.id) } });
  res.status(204).end();
});
