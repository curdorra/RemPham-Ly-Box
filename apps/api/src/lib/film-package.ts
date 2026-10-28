import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../config.js";
import { decryptSegment, filmKey, keyInfo } from "./film-keys.js";
import { deleteFilmFile, listFilmFiles, readFilmFile, writeFilmFile } from "./film-store.js";
import { type FilmPackage, type SubtitleInput, listedSubtitles, playlistDuration, startPtsFromTs, subtitleFiles, withSubtitles } from "./subtitles.js";

/**
 * Turns a video file into the HLS package under `films/<slug>/` that the
 * player and media Worker expect. Used by the film worker (uploads from the
 * staff screens) and by `scripts/publish-film.ts`.
 */

/** Three quality steps so phones on weak connections drop down instead of buffering. */
export const LADDER = [
  { name: "360p", h: 360, v: "800k", a: "96k" },
  { name: "540p", h: 540, v: "1500k", a: "128k" },
  { name: "720p", h: 720, v: "2800k", a: "128k" },
];

/** ffmpeg from FFMPEG_PATH (the worker image installs it), else the ffmpeg-static dev dependency. */
export const ffmpegPath = (): string => process.env.FFMPEG_PATH || createRequire(import.meta.url)("ffmpeg-static");

/**
 * Segment names start with a fresh tag on every conversion: segments are
 * cached as immutable, so a replaced film must never reuse an old name.
 */
export function ffmpegArgs(input: string, outDir: string, tag: string, keyInfoFile?: string): string[] {
  const filter = LADDER.map((l, i) => `[v:0]scale=-2:${l.h}[v${i}]`).join(";");
  const args = ["-hide_banner", "-y", "-i", input, "-filter_complex", filter];
  LADDER.forEach((l, i) => args.push("-map", `[v${i}]`, `-c:v:${i}`, "libx264", `-b:v:${i}`, l.v, "-map", "a:0", `-c:a:${i}`, "aac", `-b:a:${i}`, l.a));
  args.push(
    "-preset", "veryfast", "-g", "96", "-keyint_min", "96", "-sc_threshold", "0",
    "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
    ...(keyInfoFile ? ["-hls_key_info_file", keyInfoFile] : []),
    "-hls_segment_filename", join(outDir, `${tag}_%v_%04d.ts`),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", LADDER.map((l, i) => `v:${i},a:${i},name:${l.name}`).join(" "),
    join(outDir, "v%v.m3u8"),
  );
  return args;
}

const seconds = (hms: string) => hms.split(":").reduce((t, part) => t * 60 + Number(part), 0);

/** Reads "Duration: 01:52:03.12" and the latest "time=00:10:00.00" from ffmpeg's log. */
export function ffmpegProgress(log: string): number | null {
  const total = log.match(/Duration: (\d+:\d+:[\d.]+)/);
  const done = [...log.matchAll(/time=(\d+:\d+:[\d.]+)/g)].at(-1);
  if (!total || !done || !seconds(total[1])) return null;
  return Math.min(1, seconds(done[1]) / seconds(total[1]));
}

export interface PackageOptions {
  slug: string;
  /** A local path or an https link ffmpeg can read. */
  input: string;
  /** Subtitles to add; languages the film already has are kept. */
  subtitles?: SubtitleInput[];
  /** Fraction converted, 0–1. */
  onProgress?: (fraction: number) => void;
}

/**
 * Converts, uploads each segment as soon as it's finished (the worker's disk
 * stays small), then the playlists with the master last, so players never see
 * a master pointing at files that aren't up yet. Segments of the previous
 * version are removed afterwards.
 */
export async function packageFilm({ slug, input, subtitles = [], onProgress }: PackageOptions): Promise<FilmPackage> {
  const out = await mkdtemp(join(tmpdir(), "rlb-film-"));
  // The AES key never goes in `out`, so it can't be uploaded with the package.
  const keyDir = await mkdtemp(join(tmpdir(), "rlb-key-"));
  const tag = Date.now().toString(36);
  try {
    let encryption: Encryption | undefined;
    if (config.CONTENT_KEY_SECRET) {
      const iv = randomBytes(16);
      encryption = { key: filmKey(config.CONTENT_KEY_SECRET, `/films/${slug}/`), iv, info: join(keyDir, "keyinfo") };
      await writeFile(join(keyDir, "film.key"), encryption.key);
      await writeFile(encryption.info, keyInfo(join(keyDir, "film.key"), iv));
    } else {
      console.warn(`CONTENT_KEY_SECRET isn't set: ${slug} goes out unencrypted`);
    }
    const startPts = await convert(slug, input, out, tag, encryption, onProgress);
    const files = await readdir(out);
    const variantList = await readFile(join(out, `v${LADDER[0].name}.m3u8`), "utf8");
    const pkg: FilmPackage = { startPts, durationSec: playlistDuration(variantList), variants: LADDER.map((l) => l.name) };

    // Keep the subtitles the film already had, re-stamped for the new segments' start.
    const previous = await readFilmFile(slug, "master.m3u8");
    const subs = new Map<string, string>();
    for (const lang of previous ? listedSubtitles(previous.toString("utf8")) : []) {
      const vtt = await readFilmFile(slug, `subs_${lang}.vtt`);
      if (vtt) subs.set(lang, vtt.toString("utf8"));
    }
    for (const s of subtitles) subs.set(s.lang, s.text);
    const subInputs = [...subs].map(([lang, text]) => ({ lang, text }));

    await writeFilmFile(slug, "package.json", JSON.stringify(pkg));
    for (const [f, body] of Object.entries(subtitleFiles(subInputs, pkg.durationSec, pkg.startPts))) await writeFilmFile(slug, f, body);
    for (const f of files.filter((f) => f.endsWith(".m3u8") && f !== "master.m3u8")) await writeFilmFile(slug, f, await readFile(join(out, f)));
    const master = await readFile(join(out, "master.m3u8"), "utf8");
    await writeFilmFile(slug, "master.m3u8", subInputs.length ? withSubtitles(master, subInputs.map((s) => s.lang)) : master);

    for (const f of await listFilmFiles(slug)) {
      if (f.endsWith(".ts") && !f.startsWith(`${tag}_`)) await deleteFilmFile(slug, f);
    }
    return pkg;
  } finally {
    await rm(out, { recursive: true, force: true });
    await rm(keyDir, { recursive: true, force: true });
  }
}

/** Segment files safe to upload: all of them once ffmpeg is done, otherwise all but each quality's newest. */
export function finishedSegments(files: string[], all: boolean): string[] {
  const segments = files.filter((f) => f.endsWith(".ts")).sort();
  if (all) return segments;
  const quality = (f: string) => f.slice(0, f.lastIndexOf("_"));
  return segments.filter((f, i) => quality(segments[i + 1] ?? "") === quality(f));
}

/** Runs ffmpeg, sending each finished segment up as it goes. Returns the first segment's PTS. */
type Encryption = { key: Buffer; iv: Buffer; info: string };

async function convert(
  slug: string,
  input: string,
  out: string,
  tag: string,
  encryption: Encryption | undefined,
  onProgress?: (fraction: number) => void,
): Promise<number> {
  const ff = spawn(ffmpegPath(), ffmpegArgs(input, out, tag, encryption?.info), { stdio: ["ignore", "ignore", "pipe"] });
  let head = "";
  let tail = "";
  ff.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    if (head.length < 8000) head += chunk;
    tail = (tail + chunk).slice(-4000);
    const p = ffmpegProgress(head + tail);
    if (p != null) onProgress?.(p);
  });

  const first = `${tag}_${LADDER[0].name}_0000.ts`;
  let startPts: number | null = null;
  let failed: unknown = null;
  let pass = Promise.resolve();
  // One pass at a time. While ffmpeg runs, each quality's newest segment may still be
  // being written (temp_file doesn't apply to VOD playlists), so it waits for the next pass.
  const sendFinished = (all: boolean) =>
    (pass = pass.then(async () => {
      if (failed) return;
      try {
        for (const f of finishedSegments(await readdir(out), all)) {
          const body = await readFile(join(out, f));
          if (f === first) startPts = startPtsFromTs(encryption ? decryptSegment(body, encryption.key, encryption.iv) : body);
          await writeFilmFile(slug, f, body);
          await rm(join(out, f));
        }
      } catch (e) {
        failed = e;
        ff.kill("SIGKILL");
      }
    }));

  const timer = setInterval(() => sendFinished(false), 2000);
  const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (c, s) => resolve([c, s]));
  }).finally(() => clearInterval(timer));
  await sendFinished(true);
  if (failed) throw failed;
  if (code !== 0) {
    // The input may be a signed link; it must not end up in an error staff can see.
    const why = tail.split(input).join("the file").split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean).slice(-3).join(" · ");
    throw new Error(signal === "SIGKILL" ? "The converter was stopped, usually because it ran out of memory" : `ffmpeg couldn't convert this file: ${why}`.slice(0, 500));
  }
  if (startPts === null) throw new Error("ffmpeg produced no video segments");
  return startPts;
}
