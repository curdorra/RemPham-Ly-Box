import type { AdminVideo } from "@ott/shared";
import type { VideoJob } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { filmManifestUrl } from "./film-store.js";
import { packageFilm } from "./film-package.js";
import { deleteSource, sourceInput } from "./video-uploads.js";

/** A conversion that keeps getting cut off (worker restarts, out of memory) stops being retried. */
export const MAX_ATTEMPTS = 3;

export function toAdminVideo(job: VideoJob): AdminVideo {
  return {
    status: job.status,
    fileName: job.fileName,
    sizeBytes: Number(job.sizeBytes),
    progress: job.progress,
    error: job.error,
    updatedAt: job.updatedAt.toISOString(),
  };
}

/**
 * Worker start-up: a conversion that was running when the worker stopped
 * goes back in the queue, unless it has already been tried too often.
 */
export async function recoverJobs() {
  await prisma.videoJob.updateMany({
    where: { status: "CONVERTING", attempts: { gte: MAX_ATTEMPTS } },
    data: { status: "FAILED", error: "Conversion kept stopping before it finished. The file may be too large for the worker; try again or use publish-film." },
  });
  await prisma.videoJob.updateMany({ where: { status: "CONVERTING" }, data: { status: "QUEUED", progress: 0 } });
}

/** Converts the oldest queued upload. Returns false when the queue is empty. */
export async function runNextJob(): Promise<boolean> {
  const next = await prisma.videoJob.findFirst({ where: { status: "QUEUED" }, orderBy: { updatedAt: "asc" } });
  if (!next) return false;
  // Claim it; if another worker got there first, look again.
  const claimed = await prisma.videoJob.updateMany({
    where: { titleId: next.titleId, status: "QUEUED" },
    data: { status: "CONVERTING", progress: 0, error: null, attempts: { increment: 1 } },
  });
  if (!claimed.count) return true;

  const job = await prisma.videoJob.findUniqueOrThrow({ where: { titleId: next.titleId }, include: { title: true } });
  const { slug, name } = job.title;
  console.log(`[film-worker] converting ${slug} (${job.fileName})`);
  let shown = 0;
  let saving = Promise.resolve();
  try {
    const pkg = await packageFilm({
      slug,
      input: await sourceInput(job.sourceKey!),
      onProgress: (fraction) => {
        const pct = Math.floor(fraction * 99);
        if (pct < shown + 2) return;
        shown = pct;
        saving = saving.then(() => prisma.videoJob.update({ where: { titleId: job.titleId }, data: { progress: pct } }).then(() => {}));
      },
    });
    await saving;
    await prisma.title.update({
      where: { id: job.titleId },
      data: { manifestUrl: filmManifestUrl(slug), durationSec: Math.round(pkg.durationSec) },
    });
    await prisma.videoJob.update({ where: { titleId: job.titleId }, data: { status: "READY", progress: 100, sourceKey: null } });
    await deleteSource(job.sourceKey!).catch((e) => console.error(`[film-worker] couldn't delete ${job.sourceKey}`, e));
    console.log(`[film-worker] ${name} is ready`);
  } catch (e) {
    await saving.catch(() => {});
    console.error(`[film-worker] ${slug} failed`, e);
    // The original stays in storage so staff can retry without uploading again.
    await prisma.videoJob.update({
      where: { titleId: job.titleId },
      data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "Conversion failed" },
    });
  }
  return true;
}
