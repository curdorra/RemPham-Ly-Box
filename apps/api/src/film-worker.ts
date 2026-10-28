import { prisma } from "./lib/db.js";
import { recoverJobs, runNextJob } from "./lib/video-jobs.js";

/**
 * Converts films uploaded from the staff screens (a Render background worker;
 * locally: `npm run film-worker -w @ott/api`). One film at a time.
 */
const IDLE_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    // A conversion cut off here is picked up again on the next start.
    if (stopping) process.exit(1);
    stopping = true;
    console.log("[film-worker] stopping");
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

await recoverJobs();
console.log("[film-worker] waiting for uploads");
while (!stopping) {
  const worked = await runNextJob().catch((e) => {
    console.error("[film-worker]", e);
    return false;
  });
  if (!worked) await sleep(IDLE_MS);
}
