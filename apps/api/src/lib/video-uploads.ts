import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { VideoUploadTarget } from "@ott/shared";
import { config, isProd } from "../config.js";
import { HttpError } from "./errors.js";
import { LOCAL_UPLOAD_DIR, r2Client, r2Ready } from "./media.js";

/**
 * Original video files uploaded from the staff screens, kept under
 * `incoming/` until the film worker has converted them. With R2 the browser
 * sends the parts straight to the bucket on presigned URLs, so films never
 * pass through the API; without R2 (dev and tests) the parts come to the API.
 */
const MiB = 1024 * 1024;
/**
 * R2 wants every part but the last to be the same size; ~1000 parts at most keeps the URL list small.
 * Without R2 the parts go through the web app's /api proxy, which cuts bodies off at 10 MB.
 */
export const partSizeFor = (sizeBytes: number) =>
  Math.max(r2Ready() ? 16 * MiB : 8 * MiB, Math.ceil(sizeBytes / 1000 / MiB) * MiB);
const LINK_TTL_SEC = 24 * 60 * 60;

function ensureStore() {
  if (!r2Ready() && isProd) throw new HttpError(503, "storage_unavailable", "Film storage (R2) isn't set up on the server");
}

const localPath = (key: string) => join(LOCAL_UPLOAD_DIR, key);
const partsDir = (key: string) => `${localPath(key)}.parts`;

export function sourceKeyFor(titleId: string, fileName: string) {
  const ext = extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6) || ".mp4";
  return `incoming/${titleId}/${randomBytes(9).toString("base64url")}${ext}`;
}

/** Starts an upload and returns the storage upload id (R2 only) and where each part goes. */
export async function startUpload(
  titleId: string,
  key: string,
  sizeBytes: number,
): Promise<{ uploadId: string | null; target: VideoUploadTarget }> {
  ensureStore();
  const partSize = partSizeFor(sizeBytes);
  const count = Math.ceil(sizeBytes / partSize);
  const numbers = Array.from({ length: count }, (_, i) => i + 1);

  if (r2Ready()) {
    const { UploadId } = await r2Client().send(new CreateMultipartUploadCommand({ Bucket: config.R2_BUCKET, Key: key }));
    const parts = await Promise.all(
      numbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          r2Client(),
          new UploadPartCommand({ Bucket: config.R2_BUCKET, Key: key, UploadId, PartNumber: partNumber }),
          { expiresIn: LINK_TTL_SEC },
        ),
      })),
    );
    return { uploadId: UploadId!, target: { partSize, parts } };
  }
  await rm(partsDir(key), { recursive: true, force: true });
  await mkdir(partsDir(key), { recursive: true });
  return {
    uploadId: null,
    target: { partSize, parts: numbers.map((partNumber) => ({ partNumber, url: `/api/admin/titles/${titleId}/video/parts/${partNumber}` })) },
  };
}

/** Dev and tests only: stores one part sent to the API. */
export async function saveLocalPart(key: string, partNumber: number, body: Buffer) {
  await writeFile(join(partsDir(key), String(partNumber).padStart(5, "0")), body);
}

export async function completeUpload(key: string, uploadId: string | null, parts: { partNumber: number; etag: string }[]) {
  ensureStore();
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  if (r2Ready()) {
    try {
      await r2Client().send(
        new CompleteMultipartUploadCommand({
          Bucket: config.R2_BUCKET,
          Key: key,
          UploadId: uploadId!,
          MultipartUpload: { Parts: sorted.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
        }),
      );
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === "InvalidPart" || name === "InvalidPartOrder" || name === "NoSuchUpload") {
        throw new HttpError(409, "upload_incomplete", "Some of the file didn't arrive. Upload it again.");
      }
      throw e;
    }
    return;
  }
  const dir = partsDir(key);
  const files = (await readdir(dir)).sort();
  if (files.length !== sorted.length) throw new HttpError(409, "upload_incomplete", "Some of the file didn't arrive. Upload it again.");
  await mkdir(dirname(localPath(key)), { recursive: true });
  const out = createWriteStream(localPath(key));
  for (const f of files) await pipeline(createReadStream(join(dir, f)), out, { end: false });
  await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
  await rm(dir, { recursive: true, force: true });
}

/** Drops an unfinished upload. Safe to call when it's already gone. */
export async function abortUpload(key: string, uploadId: string | null) {
  if (r2Ready()) {
    if (!uploadId) return;
    try {
      await r2Client().send(new AbortMultipartUploadCommand({ Bucket: config.R2_BUCKET, Key: key, UploadId: uploadId }));
    } catch (e) {
      if ((e as { name?: string }).name !== "NoSuchUpload") throw e;
    }
    return;
  }
  await rm(partsDir(key), { recursive: true, force: true });
}

export async function deleteSource(key: string) {
  if (r2Ready()) {
    await r2Client().send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
    return;
  }
  await rm(localPath(key), { force: true });
}

/** Something ffmpeg can read the original from: a time-limited link, or a local path. */
export async function sourceInput(key: string): Promise<string> {
  if (r2Ready()) {
    return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }), { expiresIn: LINK_TTL_SEC });
  }
  await stat(localPath(key));
  return localPath(key);
}
