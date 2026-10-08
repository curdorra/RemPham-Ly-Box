/**
 * Package a film for streaming and put it on Cloudflare R2.
 *
 *   npm run publish-film -w @ott/api -- <video-file> <title-slug>   convert, upload, attach to the title
 *   npm run publish-film -w @ott/api -- --setup-cors <web-origin>   once per bucket, lets the site play the files
 *
 * Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and MEDIA_BASE_URL
 * (the bucket's public URL, no trailing slash) in the environment. DATABASE_URL points at the
 * database to update, so run it against production to publish for real.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PutBucketCorsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createRequire } from "node:module";

const ffmpegPath: string | null = createRequire(import.meta.url)("ffmpeg-static");

const need = (name: string) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return v;
};

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: need("R2_ACCESS_KEY_ID"), secretAccessKey: need("R2_SECRET_ACCESS_KEY") },
});
const Bucket = need("R2_BUCKET");

if (process.argv[2] === "--setup-cors") {
  const origin = process.argv[3];
  if (!origin) throw new Error("Usage: --setup-cors <web-origin>, e.g. https://rempham.vercel.app");
  await s3.send(
    new PutBucketCorsCommand({
      Bucket,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: [origin, "http://localhost:3000"], AllowedMethods: ["GET", "HEAD"], AllowedHeaders: ["*"], MaxAgeSeconds: 86400 }] },
    }),
  );
  console.log(`Bucket ${Bucket} now allows playback from ${origin}.`);
  process.exit(0);
}

const [input, slug] = process.argv.slice(2);
if (!input || !slug) {
  console.error("Usage: npm run publish-film -w @ott/api -- <video-file> <title-slug>");
  process.exit(1);
}

const { prisma } = await import("../src/lib/db.js");
const title = await prisma.title.findUnique({ where: { slug } });
if (!title) {
  console.error(`No title with slug "${slug}". Add it first (seed or admin).`);
  process.exit(1);
}

// Three quality steps so phones on weak connections drop down instead of buffering.
const ladder = [
  { name: "360p", h: 360, v: "800k", a: "96k" },
  { name: "540p", h: 540, v: "1500k", a: "128k" },
  { name: "720p", h: 720, v: "2800k", a: "128k" },
];
const out = mkdtempSync(join(tmpdir(), "rlb-"));
const filter = ladder.map((l, i) => `[v:0]scale=-2:${l.h}[v${i}]`).join(";");
const args = ["-y", "-i", input, "-filter_complex", filter];
ladder.forEach((l, i) => args.push("-map", `[v${i}]`, `-c:v:${i}`, "libx264", `-b:v:${i}`, l.v, "-map", "a:0", `-c:a:${i}`, "aac", `-b:a:${i}`, l.a));
args.push(
  "-preset", "veryfast", "-g", "96", "-keyint_min", "96", "-sc_threshold", "0",
  "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
  "-hls_segment_filename", join(out, "v%v_%04d.ts"),
  "-master_pl_name", "master.m3u8",
  "-var_stream_map", ladder.map((l, i) => `v:${i},a:${i},name:${l.name}`).join(" "),
  join(out, "v%v.m3u8"),
);
console.log("Converting (this takes a few minutes per film)…");
const r = spawnSync(ffmpegPath!, args, { stdio: "inherit" });
if (r.status !== 0) throw new Error("ffmpeg failed");

const files = readdirSync(out);
const type = (f: string) => (f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
for (const [n, f] of files.entries()) {
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: `films/${slug}/${f}`,
      Body: readFileSync(join(out, f)),
      ContentType: type(f),
      CacheControl: f.endsWith(".m3u8") ? "public, max-age=60" : "public, max-age=31536000, immutable",
    }),
  );
  process.stdout.write(`\rUploaded ${n + 1}/${files.length} (${basename(f)})   `);
}
rmSync(out, { recursive: true, force: true });

const manifestUrl = `${need("MEDIA_BASE_URL")}/films/${slug}/master.m3u8`;
await prisma.title.update({ where: { slug }, data: { manifestUrl } });
console.log(`\nDone. ${title.name} now streams from ${manifestUrl}`);
await prisma.$disconnect();
