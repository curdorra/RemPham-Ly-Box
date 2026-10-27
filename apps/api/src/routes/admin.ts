import { Router } from "express";
import { z } from "zod";
import { showtimesCreateSchema, snackStatusSchema } from "@ott/shared";
import type { SnackOrderStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { toSnackOrder } from "../lib/orders.js";
import { requireAdmin } from "../middleware/auth.js";
import { adminCatalogRouter } from "./admin-catalog.js";
import { adminEventsRouter } from "./admin-events.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);
adminRouter.use(adminCatalogRouter, adminEventsRouter);

const listSchema = z.object({
  status: z.enum(["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"]).optional(),
});

/** Kitchen queue: paid snack orders, soonest delivery first. */
adminRouter.get("/snack-orders", async (req, res) => {
  const { status } = listSchema.parse(req.query);
  const orders = await prisma.snackOrder.findMany({
    where: status ? { status } : { status: { in: ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY"] } },
    include: { kitchen: true, lines: true },
    orderBy: [{ scheduledFor: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: 200,
  });
  res.json(orders.map(toSnackOrder));
});

const NEXT: Partial<Record<SnackOrderStatus, SnackOrderStatus[]>> = {
  PLACED: ["ACCEPTED", "CANCELED"],
  ACCEPTED: ["OUT_FOR_DELIVERY", "CANCELED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

adminRouter.patch("/snack-orders/:id", async (req, res) => {
  const { status } = snackStatusSchema.parse(req.body);
  const order = await prisma.snackOrder.findUnique({ where: { id: req.params.id } });
  if (!order) throw notFound("Snack order");
  if (!NEXT[order.status]?.includes(status)) {
    throw new HttpError(409, "invalid_transition", `Can't move an order from ${order.status} to ${status}`);
  }
  const updated = await prisma.snackOrder.update({
    where: { id: order.id },
    data: { status },
    include: { kitchen: true, lines: true },
  });
  res.json(toSnackOrder(updated));
});

const salesSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/** Revenue per title — the numbers a filmmaker would ask for. */
adminRouter.get("/sales", async (req, res) => {
  const { days } = salesSchema.parse(req.query);
  const from = new Date(Date.now() - days * 86400_000);
  const groups = await prisma.ticket.groupBy({
    by: ["titleId"],
    where: { order: { status: "PAID", paidAt: { gte: from } } },
    _count: { _all: true },
    _sum: { pricePaise: true },
  });
  const titles = await prisma.title.findMany({ where: { id: { in: groups.map((g) => g.titleId) } } });
  const names = new Map(titles.map((t) => [t.id, t.name]));
  res.json(
    groups
      .map((g) => ({ titleId: g.titleId, name: names.get(g.titleId) ?? "", tickets: g._count._all, grossPaise: g._sum.pricePaise ?? 0 }))
      .sort((a, b) => b.grossPaise - a.grossPaise),
  );
});

/** Staff enter the physical cinema's showtimes (one or many at once). */
adminRouter.post("/showtimes", async (req, res) => {
  const input = showtimesCreateSchema.parse(req.body);
  const items = Array.isArray(input) ? input : [input];
  const cinemas = await prisma.cinema.findMany({ where: { slug: { in: [...new Set(items.map((i) => i.cinemaSlug))] } } });
  const bySlug = new Map(cinemas.map((c) => [c.slug, c]));
  for (const i of items) if (!bySlug.has(i.cinemaSlug)) throw notFound(`Cinema ${i.cinemaSlug}`);
  const titleIds = [...new Set(items.flatMap((i) => (i.titleId ? [i.titleId] : [])))];
  if (titleIds.length && (await prisma.title.count({ where: { id: { in: titleIds } } })) !== titleIds.length) throw notFound("Title");

  const created = await prisma.$transaction(
    items.map((i) =>
      prisma.showtime.create({
        data: {
          cinemaId: bySlug.get(i.cinemaSlug)!.id,
          filmName: i.filmName,
          titleId: i.titleId ?? null,
          posterUrl: i.posterUrl ?? null,
          language: i.language ?? null,
          format: i.format,
          startsAt: new Date(i.startsAt),
        },
      }),
    ),
  );
  res.status(201).json(created.map((c) => ({ id: c.id, filmName: c.filmName, startsAt: c.startsAt.toISOString() })));
});

adminRouter.delete("/showtimes/:id", async (req, res) => {
  const removed = await prisma.showtime.deleteMany({ where: { id: req.params.id } });
  if (!removed.count) throw notFound("Showtime");
  res.status(204).end();
});
