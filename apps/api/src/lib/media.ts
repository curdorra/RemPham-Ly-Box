import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config, isProd } from "../config.js";
import { HttpError } from "./errors.js";

/** Where dev uploads land when R2 isn't configured; served at /uploads. */
export const LOCAL_UPLOAD_DIR = join(process.cwd(), "uploads");

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const r2Ready = () =>
  !!(config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY && config.R2_BUCKET && config.MEDIA_BASE_URL);

let s3: S3Client | null = null;
export const r2Client = () =>
  (s3 ??= new S3Client({
    region: "auto",
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY },
  }));

/**
 * Stores an uploaded image and returns the URL to save on the record. Keys are
 * random, so files are immutable and cache forever.
 */
export async function saveImage(kind: string, body: Buffer, contentType: string): Promise<string> {
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw new HttpError(415, "unsupported_type", "Upload a JPEG, PNG, WebP or AVIF image");
  const key = `artwork/${kind}/${randomBytes(9).toString("base64url")}.${ext}`;

  if (r2Ready()) {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: config.R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${config.MEDIA_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  if (isProd) throw new HttpError(503, "uploads_unavailable", "Image uploads aren't set up (R2). Paste an image URL instead.");

  const file = join(LOCAL_UPLOAD_DIR, key);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
  // Relative to the web origin: the site proxies /api/* to this server.
  return `/api/uploads/${key}`;
}
