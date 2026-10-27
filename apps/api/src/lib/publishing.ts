import { prisma } from "./db.js";
import { invalidateRecommendations } from "./recommend.js";
import { invalidateSearchIndex } from "./search.js";

/** Call after any catalog change so search and recommendations see it now, not in a minute. */
export function catalogChanged() {
  invalidateSearchIndex();
  invalidateRecommendations();
}

/**
 * Publishes drafts whose scheduled time has passed. publishAt is cleared so a
 * later "unpublish" sticks.
 */
export async function publishDueTitles(now = new Date()) {
  const { count } = await prisma.title.updateMany({
    where: { published: false, publishAt: { lte: now } },
    data: { published: true, publishAt: null },
  });
  if (count) catalogChanged();
  return count;
}

/** Checks every minute while the server runs (and once at start, after a sleep). */
export function startPublishingSchedule(everyMs = 60_000) {
  const tick = () => publishDueTitles().catch((e) => console.error("Scheduled publishing failed:", e));
  void tick();
  return setInterval(tick, everyMs).unref();
}
