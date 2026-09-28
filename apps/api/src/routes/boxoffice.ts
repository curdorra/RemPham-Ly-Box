import { Router } from "express";
import { z } from "zod";
import type { BoxOffice, BoxOfficeEntry } from "@ott/shared";
import { prisma } from "../lib/db.js";
import { titleSummaryInclude, toTitleSummary } from "../lib/serialize.js";

export const boxOfficeRouter = Router();

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(30).default(7) });
const TOP = 10;

async function ticketsSold(from: Date, to: Date) {
  const groups = await prisma.ticket.groupBy({
    by: ["titleId"],
    where: { order: { status: "PAID", paidAt: { gte: from, lt: to } }, title: { published: true } },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.titleId, g._count._all]));
}

function rank(counts: Map<string, number>, names: Map<string, string>) {
  return [...counts]
    .sort((a, b) => b[1] - a[1] || (names.get(a[0]) ?? "").localeCompare(names.get(b[0]) ?? ""))
    .map(([titleId], i) => [titleId, i + 1] as const);
}

/** Public chart of tickets sold, compared with the period before. */
boxOfficeRouter.get("/", async (req, res) => {
  const { days } = querySchema.parse(req.query);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const prevFrom = new Date(from.getTime() - days * 86400_000);
  const [current, previous] = await Promise.all([ticketsSold(from, to), ticketsSold(prevFrom, from)]);

  const titles = await prisma.title.findMany({
    where: { id: { in: [...new Set([...current.keys(), ...previous.keys()])] } },
    include: titleSummaryInclude,
  });
  const byId = new Map(titles.map((t) => [t.id, t]));
  const names = new Map(titles.map((t) => [t.id, t.name]));
  const prevRanks = new Map(rank(previous, names));

  const entries: BoxOfficeEntry[] = rank(current, names)
    .slice(0, TOP)
    .map(([titleId, r]) => {
      const prev = prevRanks.get(titleId) ?? null;
      const trend = prev === null ? "NEW" : prev > r ? "UP" : prev < r ? "DOWN" : "SAME";
      return { rank: r, title: toTitleSummary(byId.get(titleId)!), tickets: current.get(titleId)!, previousRank: prev, trend };
    });
  const chart: BoxOffice = { from: from.toISOString(), to: to.toISOString(), entries };
  res.json(chart);
});
