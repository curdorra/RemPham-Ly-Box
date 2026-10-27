/**
 * Package a film for streaming and put it on Cloudflare R2.
 *
 *   npm run publish-film -w @ott/api -- <video-file> <title-slug> [--sub en=film.srt --sub lus=film.lus.srt]
 *                                                                   convert, upload, attach to the title
 *   npm run publish-film -w @ott/api -- --subs <title-slug> en=film.srt [lus=…]
 *                                                                   add or replace subtitles on a published film
 *   npm run publish-film -w @ott/api -- --setup-cors <web-origin>   once per bucket, lets the site play the files
 *
 * Subtitles are SRT or WebVTT files; the language code goes before "=" (en, lus = Mizo).
 *
 * Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and MEDIA_BASE_URL
 * (the bucket's public URL, no trailing slash) in the environment. DATABASE_URL points at the
 * database to update, so run it against production to publish for real.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { GetObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createRequire } from "node:module";
import { listedSubtitles, parseSubArg, playlistDuration, startPtsFromProbe, subtitleFiles, withSubtitles } from "./lib/subtitles.js";

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

const type = (f: string) => (f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : f.endsWith(".vtt") ? "text/vtt" : "video/mp2t");
const put = (key: string, body: Buffer | string, f = key) =>
  s3.send(
    new PutObjectCommand({
      Bucket,
      Key: key,
      Body: body,
      ContentType: type(f),
      // Playlists and subtitles can be replaced later; segments never change.
      CacheControl: f.endsWith(".ts") ? "public, max-age=31536000, immutable" : "public, max-age=60",
    }),
  );
const readSubs = (args: string[]) =>
  args.map(parseSubArg).map(({ lang, path }) => ({ lang, text: readFileSync(path, "utf8") }));
/** Starting PTS of a segment; ffmpeg prints it as "start: 1.400000" when it opens the file. */
const probeStartPts = (file: string) => startPtsFromProbe(spawnSync(ffmpegPath!, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr);

if (process.argv[2] === "--subs") {
  const [slug, ...subArgs] = process.argv.slice(3);
  if (!slug || !subArgs.length) {
    console.error("Usage: npm run publish-film -w @ott/api -- --subs <title-slug> en=film.srt [lus=film.lus.srt]");
    process.exit(1);
  }
  const subs = readSubs(subArgs);
  const get = async (f: string) => {
    const r = await s3.send(new GetObjectCommand({ Bucket, Key: `films/${slug}/${f}` }));
    return Buffer.from(await r.Body!.transformToByteArray());
  };
  const master = (await get("master.m3u8")).toString("utf8");
  const variant = master.split("\n").find((l) => l.trim() && !l.startsWith("#"))!.trim();
  const variantList = (await get(variant)).toString("utf8");
  const firstSeg = variantList.split("\n").find((l) => l.trim() && !l.startsWith("#"))!.trim();
  const tmp = mkdtempSync(join(tmpdir(), "rlb-"));
  writeFileSync(join(tmp, firstSeg), await get(firstSeg));
  const startPts = probeStartPts(join(tmp, firstSeg));
  rmSync(tmp, { recursive: true, force: true });

  for (const [f, body] of Object.entries(subtitleFiles(subs, playlistDuration(variantList), startPts))) await put(`films/${slug}/${f}`, body, f);
  const langs = [...new Set([...listedSubtitles(master), ...subs.map((s) => s.lang)])];
  // Master last, so it never lists a language whose files aren't up yet.
  await put(`films/${slug}/master.m3u8`, withSubtitles(master, langs), "master.m3u8");
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
const subs = readSubs(subArgs);

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

if (subs.length) {
  const variantList = readFileSync(join(out, `v${ladder[0].name}.m3u8`), "utf8");
  const startPts = probeStartPts(join(out, `v${ladder[0].name}_0000.ts`));
  for (const [f, body] of Object.entries(subtitleFiles(subs, playlistDuration(variantList), startPts))) writeFileSync(join(out, f), body);
  const masterPath = join(out, "master.m3u8");
  writeFileSync(masterPath, withSubtitles(readFileSync(masterPath, "utf8"), subs.map((s) => s.lang)));
}

// Master last, so it never points at files that aren't up yet.
const files = readdirSync(out).sort((a, b) => Number(a === "master.m3u8") - Number(b === "master.m3u8"));
for (const [n, f] of files.entries()) {
  await put(`films/${slug}/${f}`, readFileSync(join(out, f)), f);
  process.stdout.write(`\rUploaded ${n + 1}/${files.length} (${basename(f)})   `);
}
rmSync(out, { recursive: true, force: true });

const manifestUrl = `${need("MEDIA_BASE_URL")}/films/${slug}/master.m3u8`;
await prisma.title.update({ where: { slug }, data: { manifestUrl } });
console.log(`\nDone. ${title.name} now streams from ${manifestUrl}`);
await prisma.$disconnect();
