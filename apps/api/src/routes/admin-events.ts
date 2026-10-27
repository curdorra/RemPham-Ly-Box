import { Router } from "express";
import type { AdminKitchen, AdminScreening } from "@ott/shared";
import {
  kitchenInputSchema,
  kitchenUpdateSchema,
  screeningInputSchema,
  screeningUpdateSchema,
  slugify,
  snackItemInputSchema,
  snackItemUpdateSchema,
} from "@ott/shared";
import type { Kitchen, Screening, SnackItem, Title } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { screeningState } from "../lib/tickets.js";

/** Opening nights and partner kitchens. Mounted under /admin. */
export const adminEventsRouter = Router();

// ── Opening nights ──────────────────────────────────────────────────────────

const DAY_MS = 86400_000;

async function toAdminScreening(s: Screening & { title: Title }, now = new Date()): Promise<AdminScreening> {
  const [seatsSold, anyTickets] = await Promise.all([
    prisma.ticket.count({ where: { screeningId: s.id, order: { status: "PAID" } } }),
    prisma.ticket.count({ where: { screeningId: s.id } }),
  ]);
  return {
    id: s.id,
    title: { id: s.title.id, name: s.title.name, posterUrl: s.title.posterUrl, pricePaise: s.title.pricePaise, published: s.title.published },
    startsAt: s.startsAt.toISOString(),
    pricePaise: s.pricePaise,
    rows: s.rows,
    seatsPerRow: s.seatsPerRow,
    aisleAfter: s.aisleAfter,
    capacity: s.rows * s.seatsPerRow,
    seatsSold,
    hasTickets: anyTickets > 0,
    state: screeningState(s, s.title, now),
  };
}

function checkAisles(aisleAfter: number[] | undefined, seatsPerRow: number) {
  if (aisleAfter?.some((n) => n >= seatsPerRow)) {
    throw new HttpError(400, "invalid_aisle", `Aisles must come after a seat between 1 and ${seatsPerRow - 1}`);
  }
}

/** Upcoming opening nights, and those from the last 30 days. */
adminEventsRouter.get("/screenings", async (_req, res) => {
  const now = new Date();
  const rows = await prisma.screening.findMany({
    where: { startsAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
    include: { title: true },
    orderBy: { startsAt: "asc" },
  });
  res.json(await Promise.all(rows.map((s) => toAdminScreening(s, now))));
});

adminEventsRouter.post("/screenings", async (req, res) => {
  const input = screeningInputSchema.parse(req.body);
  const title = await prisma.title.findUnique({ where: { id: input.titleId } });
  if (!title) throw notFound("Title");
  if (title.type !== "MOVIE") throw new HttpError(400, "not_a_movie", "Opening nights are for films, not series");
  checkAisles(input.aisleAfter, input.seatsPerRow);
  const created = await prisma.screening.create({
    data: { ...input, startsAt: new Date(input.startsAt), pricePaise: input.pricePaise ?? null },
    include: { title: true },
  });
  res.status(201).json(await toAdminScreening(created));
});

/** Time and price can always change; the seat map only until the first ticket. */
adminEventsRouter.patch("/screenings/:id", async (req, res) => {
  const input = screeningUpdateSchema.parse(req.body);
  const s = await prisma.screening.findUnique({ where: { id: req.params.id } });
  if (!s) throw notFound("Screening");
  const layoutChange = input.rows !== undefined || input.seatsPerRow !== undefined || input.aisleAfter !== undefined;
  if (layoutChange && (await prisma.ticket.count({ where: { screeningId: s.id } }))) {
    throw new HttpError(409, "has_tickets", "Seats are already sold, so the seat map can't change");
  }
  checkAisles(input.aisleAfter ?? s.aisleAfter, input.seatsPerRow ?? s.seatsPerRow);
  const updated = await prisma.screening.update({
    where: { id: s.id },
    data: { ...input, ...(input.startsAt && { startsAt: new Date(input.startsAt) }) },
    include: { title: true },
  });
  res.json(await toAdminScreening(updated));
});

adminEventsRouter.delete("/screenings/:id", async (req, res) => {
  const s = await prisma.screening.findUnique({ where: { id: req.params.id } });
  if (!s) throw notFound("Screening");
  if (await prisma.ticket.count({ where: { screeningId: s.id } })) {
    throw new HttpError(409, "has_tickets", "Tickets are sold for this night. Move it to a new time instead.");
  }
  await prisma.screening.delete({ where: { id: s.id } });
  res.status(204).end();
});

// ── Kitchens & snacks ───────────────────────────────────────────────────────

const toAdminKitchen = (k: Kitchen & { items: SnackItem[] }): AdminKitchen => ({
  id: k.id,
  name: k.name,
  phone: k.phone,
  active: k.active,
  items: k.items.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    description: i.description,
    pricePaise: i.pricePaise,
    available: i.available,
    sort: i.sort,
  })),
});

const kitchenInclude = { items: { orderBy: [{ sort: "asc" as const }, { name: "asc" as const }] } };

async function loadKitchen(id: string) {
  const k = await prisma.kitchen.findUnique({ where: { id }, include: kitchenInclude });
  if (!k) throw notFound("Kitchen");
  return k;
}

/** A free slug for a new menu item ("momo", "momo-2"…). */
async function itemSlug(name: string) {
  const base = slugify(name) || "item";
  const taken = new Set((await prisma.snackItem.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((i) => i.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

adminEventsRouter.get("/kitchens", async (_req, res) => {
  const kitchens = await prisma.kitchen.findMany({ include: kitchenInclude, orderBy: { name: "asc" } });
  res.json(kitchens.map(toAdminKitchen));
});

adminEventsRouter.post("/kitchens", async (req, res) => {
  const input = kitchenInputSchema.parse(req.body);
  const k = await prisma.kitchen.create({ data: input, include: kitchenInclude });
  res.status(201).json(toAdminKitchen(k));
});

adminEventsRouter.patch("/kitchens/:id", async (req, res) => {
  const input = kitchenUpdateSchema.parse(req.body);
  await loadKitchen(req.params.id);
  const k = await prisma.kitchen.update({ where: { id: req.params.id }, data: input, include: kitchenInclude });
  res.json(toAdminKitchen(k));
});

/** Kitchens with past orders are kept for the records; turn them off instead. */
adminEventsRouter.delete("/kitchens/:id", async (req, res) => {
  await loadKitchen(req.params.id);
  if (await prisma.snackOrder.count({ where: { kitchenId: req.params.id } })) {
    throw new HttpError(409, "has_orders", "This kitchen has orders on record. Switch it off instead.");
  }
  await prisma.kitchen.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

adminEventsRouter.post("/kitchens/:id/items", async (req, res) => {
  const input = snackItemInputSchema.parse(req.body);
  const kitchen = await loadKitchen(req.params.id);
  await prisma.snackItem.create({ data: { ...input, slug: await itemSlug(input.name), kitchenId: kitchen.id } });
  res.status(201).json(toAdminKitchen(await loadKitchen(kitchen.id)));
});

adminEventsRouter.patch("/snack-items/:id", async (req, res) => {
  const input = snackItemUpdateSchema.parse(req.body);
  const item = await prisma.snackItem.findUnique({ where: { id: req.params.id } });
  if (!item) throw notFound("Snack item");
  await prisma.snackItem.update({ where: { id: item.id }, data: input });
  res.json(toAdminKitchen(await loadKitchen(item.kitchenId)));
});

adminEventsRouter.delete("/snack-items/:id", async (req, res) => {
  const item = await prisma.snackItem.findUnique({ where: { id: req.params.id } });
  if (!item) throw notFound("Snack item");
  if (await prisma.snackOrderLine.count({ where: { itemId: item.id } })) {
    throw new HttpError(409, "has_orders", "People have ordered this. Mark it unavailable instead.");
  }
  await prisma.snackItem.delete({ where: { id: item.id } });
  res.json(toAdminKitchen(await loadKitchen(item.kitchenId)));
});
