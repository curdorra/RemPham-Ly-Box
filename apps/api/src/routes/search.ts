import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { searchQuerySchema } from "@ott/shared";
import type { Title } from "../generated/prisma/client.js";
import { KIDS_MATURITIES, currentProfile } from "../lib/profiles.js";
import { catalogStats } from "../lib/recommend.js";
import { search, suggest } from "../lib/search.js";

export const searchRouter = Router();

async function allowedFor(req: Request): Promise<(t: Title) => boolean> {
  if (!req.userId) return () => true;
  const profile = await currentProfile(req);
  return profile.kids ? (t) => KIDS_MATURITIES.includes(t.maturity) : () => true;
}

/** Full search: typo-tolerant, diacritic-insensitive, across titles, people, genres and tags. */
searchRouter.get("/", async (req, res) => {
  const { q, limit } = searchQuerySchema.parse(req.query);
  const stats = await catalogStats();
  res.json(await search(q, { limit, allowed: await allowedFor(req), popularity: stats.popularity }));
});

/** As-you-type suggestions. */
searchRouter.get("/suggest", async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(100).default("") }).parse(req.query);
  res.json(await suggest(q, await allowedFor(req)));
});
