import { Router } from "express";
import { z } from "zod";
import type { CinemaSchedule } from "@ott/shared";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { titleSummaryInclude, toTitleSummary } from "../lib/serialize.js";

export const cinemaRouter = Router();

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(14).default(7) });

/** YYYY-MM-DD for an instant in the cinema's own time zone. */
export function localDate(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function bookingUrl(template: string, date: string) {
  return template.replace("{date}", date.replaceAll("-", ""));
}

/**
 * What's on at our physical cinema. Booking happens on BookMyShow (no public
 * API), so each day links straight to its buy-tickets page.
 */
cinemaRouter.get("/:slug", async (req, res) => {
  const { days } = querySchema.parse(req.query);
  const cinema = await prisma.cinema.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!cinema) throw notFound("Cinema");
  const now = new Date();
  const showtimes = await prisma.showtime.findMany({
    where: { cinemaId: cinema.id, startsAt: { gte: now, lt: new Date(now.getTime() + days * 86400_000) } },
    include: { title: { include: titleSummaryInclude } },
    orderBy: { startsAt: "asc" },
  });

  const byDay = new Map<string, CinemaSchedule["days"][number]>();
  for (let i = 0; i < days; i++) {
    const date = localDate(new Date(now.getTime() + i * 86400_000), cinema.timeZone);
    byDay.set(date, { date, bookingUrl: bookingUrl(cinema.bookingUrlTemplate, date), showtimes: [] });
  }
  for (const s of showtimes) {
    const day = byDay.get(localDate(s.startsAt, cinema.timeZone));
    day?.showtimes.push({
      id: s.id,
      filmName: s.filmName,
      posterUrl: s.posterUrl ?? s.title?.posterUrl ?? null,
      language: s.language,
      format: s.format,
      startsAt: s.startsAt.toISOString(),
      title: s.title && s.title.published ? toTitleSummary(s.title) : null,
    });
  }

  const schedule: CinemaSchedule = {
    cinema: { slug: cinema.slug, name: cinema.name, city: cinema.city, address: cinema.address },
    days: [...byDay.values()],
  };
  res.json(schedule);
});
