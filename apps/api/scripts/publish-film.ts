/**
 * Package a film for streaming and put it on Cloudflare R2, from your own computer.
 * (Staff can also upload from the film's admin page; the film worker converts those.)
 *
 *   npm run publish-film -w @ott/api -- <video-file> <title-slug> [--sub en=film.srt --sub lus=film.lus.srt]
 *                                                                   convert, upload, attach to the title
 *   npm run publish-film -w @ott/api -- --subs <title-slug> en=film.srt [lus=…]
 *                                                                   add or replace subtitles on a published film
 *   npm run publish-film -w @ott/api -- --setup-cors <web-origin> [<web-origin>…]
 *                                                                   once per bucket, lets the admin page upload films
 *
 * Subtitles are SRT or WebVTT files; the language code goes before "=" (en, lus = Mizo).
 *
 * Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and MEDIA_BASE_URL
 * (the bucket's public URL, no trailing slash) in the environment. DATABASE_URL points at the
 * database to update, so run it against production to publish for real.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { subtitleLangSchema } from "@ott/shared";
import { config } from "../src/config.js";
import { putSubtitle } from "../src/lib/film-subtitles.js";
import { packageFilm } from "../src/lib/film-package.js";
import { filmManifestUrl } from "../src/lib/film-store.js";
import { r2Client, r2Ready } from "../src/lib/media.js";
import { parseSubArg } from "../src/lib/subtitles.js";

if (!r2Ready()) {
  console.error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and MEDIA_BASE_URL first");
  process.exit(1);
}

if (process.argv[2] === "--setup-cors") {
  const origins = process.argv.slice(3);
  if (!origins.length) throw new Error("Usage: --setup-cors <web-origin> [<web-origin>…], e.g. https://remphamly.com");
  // Playback goes through the media Worker (its own CORS); this is for admin uploads, which go straight to R2.
  await r2Client().send(
    new PutBucketCorsCommand({
      Bucket: config.R2_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [...origins, "http://localhost:3000"],
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedHeaders: ["*"],
            // The browser needs each part's ETag to finish a multipart upload.
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    }),
  );
  console.log(`Bucket ${config.R2_BUCKET} now accepts uploads from ${origins.join(", ")}.`);
  process.exit(0);
}

const readSubs = (args: string[]) =>
  args.map(parseSubArg).map(({ lang, path }) => ({ lang: subtitleLangSchema.parse(lang), text: readFileSync(path, "utf8") }));

if (process.argv[2] === "--subs") {
  const [slug, ...subArgs] = process.argv.slice(3);
  if (!slug || !subArgs.length) {
    console.error("Usage: npm run publish-film -w @ott/api -- --subs <title-slug> en=film.srt [lus=film.lus.srt]");
    process.exit(1);
  }
  let langs: string[] = [];
  for (const s of readSubs(subArgs)) langs = (await putSubtitle(slug, s.lang, s.text)).languages.map((l) => l.lang);
  console.log(`Subtitles on ${slug}: ${langs.join(", ")}. Players pick them up within a minute.`);
  process.exit(0);
}

const positional: string[] = [];
const subArgs: string[] = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--sub") subArgs.push(process.argv[++i]);
  else positional.push(process.argv[i]);
}
const [input, slug] = positional;
if (!input || !slug) {
  console.error("Usage: npm run publish-film -w @ott/api -- <video-file> <title-slug> [--sub en=film.srt]");
  process.exit(1);
}
const subtitles = readSubs(subArgs);

const { prisma } = await import("../src/lib/db.js");
const title = await prisma.title.findUnique({ where: { slug }, include: { videoJob: true } });
if (!title) {
  console.error(`No title with slug "${slug}". Add it first (seed or admin).`);
  process.exit(1);
}
if (title.videoJob?.status === "QUEUED" || title.videoJob?.status === "CONVERTING") {
  console.error(`An upload of "${title.name}" from the admin page is being converted. Wait for it to finish.`);
  process.exit(1);
}

console.log("Converting and uploading (this takes a few minutes per film)…");
let shown = -1;
const pkg = await packageFilm({
  slug,
  input,
  subtitles,
  onProgress: (fraction) => {
    const pct = Math.floor(fraction * 100);
    if (pct !== shown) process.stdout.write(`\r${(shown = pct)}%   `);
  },
});

const manifestUrl = filmManifestUrl(slug);
await prisma.title.update({ where: { slug }, data: { manifestUrl, durationSec: Math.round(pkg.durationSec) } });
console.log(`\nDone. ${title.name} now streams from ${manifestUrl}`);
await prisma.$disconnect();
