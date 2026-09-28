import { Router } from "express";
import type { SnackItem } from "@ott/shared";
import { prisma } from "../lib/db.js";

export const snacksRouter = Router();

snacksRouter.get("/", async (_req, res) => {
  const items = await prisma.snackItem.findMany({
    where: { available: true, kitchen: { active: true } },
    include: { kitchen: true },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  const menu: SnackItem[] = items.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    description: i.description,
    pricePaise: i.pricePaise,
    kitchen: { id: i.kitchen.id, name: i.kitchen.name },
  }));
  res.json(menu);
});
