import { Router } from "express";
import { statsRangeSchema } from "@ott/shared";
import { adminStats } from "../lib/stats.js";

/** Staff statistics, computed from existing data only. Mounted under /admin. */
export const adminStatsRouter = Router();

/** GET /admin/stats?days=30 or ?from=2026-10-01&to=2026-10-27 */
adminStatsRouter.get("/stats", async (req, res) => {
  res.json(await adminStats(statsRangeSchema.parse(req.query)));
});
