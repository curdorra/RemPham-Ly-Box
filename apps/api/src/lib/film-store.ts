import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { config, isProd } from "../config.js";
import { HttpError } from "./errors.js";
import { LOCAL_UPLOAD_DIR, r2Client, r2Ready } from "./media.js";

/**
 * Files of a packaged film, `films/<slug>/…`. R2 when configured, otherwise
 * `uploads/films/…` on disk (dev and tests only).
 */
const contentType = (f: string) =>
  f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : f.endsWith(".vtt") ? "text/vtt" : f.endsWith(".json") ? "application/json" : "video/mp2t";

const keyOf = (slug: string, file: string) => `films/${slug}/${file}`;

function ensureStore() {
  if (!r2Ready() && isProd) throw new HttpError(503, "storage_unavailable", "Film storage (R2) isn't set up on the server");
}

/** The file's bytes, or null when it doesn't exist. */
export async function readFilmFile(slug: string, file: string): Promise<Buffer | null> {
  ensureStore();
  if (r2Ready()) {
    try {
      const r = await r2Client().send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: keyOf(slug, file) }));
      return Buffer.from(await r.Body!.transformToByteArray());
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }
  try {
    return await readFile(join(LOCAL_UPLOAD_DIR, keyOf(slug, file)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function writeFilmFile(slug: string, file: string, body: string | Buffer): Promise<void> {
  ensureStore();
  if (r2Ready()) {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: config.R2_BUCKET,
        Key: keyOf(slug, file),
        Body: body,
        ContentType: contentType(file),
        // Same as publish-film: playlists and subtitles can be replaced later.
        CacheControl: "public, max-age=60",
      }),
    );
    return;
  }
  const path = join(LOCAL_UPLOAD_DIR, keyOf(slug, file));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

export async function deleteFilmFile(slug: string, file: string): Promise<void> {
  ensureStore();
  if (r2Ready()) {
    await r2Client().send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: keyOf(slug, file) }));
    return;
  }
  await rm(join(LOCAL_UPLOAD_DIR, keyOf(slug, file)), { force: true });
}
