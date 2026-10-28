import express, { Router } from "express";
import { z } from "zod";
import type { VideoUploadTarget } from "@ott/shared";
import { videoCompleteSchema, videoUploadSchema } from "@ott/shared";
import { r2Ready } from "../lib/media.js";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { toAdminVideo } from "../lib/video-jobs.js";
import { abortUpload, completeUpload, deleteSource, partSizeFor, saveLocalPart, sourceKeyFor, startUpload } from "../lib/video-uploads.js";

/**
 * Film video uploads from the staff screens. The browser sends the file in
 * parts (straight to R2 in production), then the film worker converts it.
 * Mounted under /admin.
 */
export const adminVideoRouter = Router();

async function loadMovie(id: string) {
  const title = await prisma.title.findUnique({ where: { id }, include: { videoJob: true } });
  if (!title) throw notFound("Title");
  if (title.type !== "MOVIE") throw new HttpError(400, "not_a_movie", "Video uploads are for films; series episodes take a stream link");
  return title;
}

const busy = () => new HttpError(409, "video_busy", "This film's last upload is still being converted. Wait for it to finish.");

adminVideoRouter.get("/titles/:id/video", async (req, res) => {
  const { videoJob } = await loadMovie(req.params.id);
  res.json(videoJob ? toAdminVideo(videoJob) : null);
});

/** Starts an upload, replacing any unfinished or failed one. The current video keeps playing until the new one is ready. */
adminVideoRouter.post("/titles/:id/video/uploads", async (req, res) => {
  const { fileName, sizeBytes } = videoUploadSchema.parse(req.body);
  const { id, videoJob: old } = await loadMovie(req.params.id);
  if (old?.status === "QUEUED" || old?.status === "CONVERTING") throw busy();
  if (old?.sourceKey) {
    if (old.status === "UPLOADING") await abortUpload(old.sourceKey, old.uploadId);
    else await deleteSource(old.sourceKey);
  }

  const sourceKey = sourceKeyFor(id, fileName);
  const { uploadId, target } = await startUpload(id, sourceKey, sizeBytes);
  const job = { status: "UPLOADING" as const, fileName, sizeBytes, sourceKey, uploadId, progress: 0, error: null, attempts: 0 };
  await prisma.videoJob.upsert({ where: { titleId: id }, create: { titleId: id, ...job }, update: job });
  res.status(201).json(target satisfies VideoUploadTarget);
});

/** Dev and tests only (no R2): the browser sends each part here instead of to R2. */
adminVideoRouter.put(
  "/titles/:id/video/parts/:n",
  express.raw({ type: () => true, limit: "200mb" }),
  async (req, res) => {
    if (r2Ready()) throw notFound("Upload part");
    const n = z.coerce.number().int().min(1).parse(req.params.n);
    const { videoJob: job } = await loadMovie(req.params.id);
    if (job?.status !== "UPLOADING" || !job.sourceKey) throw new HttpError(409, "no_upload", "Start the upload again");
    const partSize = partSizeFor(Number(job.sizeBytes));
    if (n > Math.ceil(Number(job.sizeBytes) / partSize) || !Buffer.isBuffer(req.body) || req.body.length > partSize) {
      throw new HttpError(400, "bad_part", "That part doesn't belong to this upload");
    }
    await saveLocalPart(job.sourceKey, n, req.body);
    res.set("ETag", `"${n}"`).status(204).end();
  },
);

/** All parts are up: join them and queue the conversion. */
adminVideoRouter.post("/titles/:id/video/complete", async (req, res) => {
  const { parts } = videoCompleteSchema.parse(req.body);
  const { id, videoJob: job } = await loadMovie(req.params.id);
  if (job?.status !== "UPLOADING" || !job.sourceKey) throw new HttpError(409, "no_upload", "Start the upload again");
  await completeUpload(job.sourceKey, job.uploadId, parts);
  const queued = await prisma.videoJob.update({ where: { titleId: id }, data: { status: "QUEUED", uploadId: null } });
  res.json(toAdminVideo(queued));
});

/** Cancels an upload in progress. */
adminVideoRouter.delete("/titles/:id/video/upload", async (req, res) => {
  const { id, videoJob: job } = await loadMovie(req.params.id);
  if (job?.status !== "UPLOADING") throw new HttpError(409, "no_upload", "Nothing is uploading");
  if (job.sourceKey) await abortUpload(job.sourceKey, job.uploadId);
  await prisma.videoJob.delete({ where: { titleId: id } });
  res.status(204).end();
});

/** Converts a failed upload again, without uploading it again. */
adminVideoRouter.post("/titles/:id/video/retry", async (req, res) => {
  const { id, videoJob: job } = await loadMovie(req.params.id);
  if (job?.status !== "FAILED" || !job.sourceKey) throw new HttpError(409, "cannot_retry", "Upload the file again");
  const queued = await prisma.videoJob.update({ where: { titleId: id }, data: { status: "QUEUED", progress: 0, error: null, attempts: 0 } });
  res.json(toAdminVideo(queued));
});
