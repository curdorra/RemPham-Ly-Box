import type { AdminSubtitles } from "@ott/shared";
import { HttpError } from "./errors.js";
import { deleteFilmFile, readFilmFile, writeFilmFile } from "./film-store.js";
import {
  type FilmPackage,
  listedSubtitles,
  playlistDuration,
  startPtsFromTs,
  subtitleFiles,
  subtitleName,
  variantsFromMaster,
  withSubtitles,
} from "./subtitles.js";

const firstUri = (playlist: string) => playlist.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim();
const text = (b: Buffer) => b.toString("utf8");

/** What publish-film recorded, or for older films worked out from the first TS segment. */
async function filmPackage(slug: string, master: string): Promise<{ pkg: FilmPackage; recorded: boolean }> {
  const recorded = await readFilmFile(slug, "package.json");
  if (recorded) return { pkg: JSON.parse(text(recorded)) as FilmPackage, recorded: true };

  const variant = firstUri(master);
  const variantList = variant && (await readFilmFile(slug, variant));
  const segment = variantList && firstUri(text(variantList));
  const bytes = segment && (await readFilmFile(slug, segment));
  if (!variantList || !bytes) throw new HttpError(409, "broken_film", "This film's files are incomplete. Publish it again.");
  return {
    pkg: { startPts: startPtsFromTs(bytes), durationSec: playlistDuration(text(variantList)), variants: variantsFromMaster(master) },
    recorded: false,
  };
}

export async function listSubtitles(slug: string): Promise<AdminSubtitles> {
  const master = await readFilmFile(slug, "master.m3u8");
  if (!master) return { hasVideo: false, languages: [] };
  return { hasVideo: true, languages: listedSubtitles(text(master)).map((lang) => ({ lang, name: subtitleName(lang) })) };
}

/** Adds or replaces one language. The master playlist goes up last, so it never lists files that aren't there yet. */
export async function putSubtitle(slug: string, lang: string, source: string): Promise<AdminSubtitles> {
  if (!source.includes("-->")) throw new HttpError(400, "bad_subtitles", "That doesn't look like an .srt or .vtt subtitle file");
  const masterFile = await readFilmFile(slug, "master.m3u8");
  if (!masterFile) throw new HttpError(409, "no_video", "Package this film's video first, then add subtitles");
  const master = text(masterFile);

  const { pkg, recorded } = await filmPackage(slug, master);
  if (!recorded) await writeFilmFile(slug, "package.json", JSON.stringify(pkg));
  for (const [file, body] of Object.entries(subtitleFiles([{ lang, text: source }], pkg.durationSec, pkg.startPts))) {
    await writeFilmFile(slug, file, body);
  }
  const langs = [...new Set([...listedSubtitles(master), lang])];
  await writeFilmFile(slug, "master.m3u8", withSubtitles(master, langs));
  return listSubtitles(slug);
}

/** Master first (players stop asking for the language), then the files. */
export async function removeSubtitle(slug: string, lang: string): Promise<AdminSubtitles> {
  const masterFile = await readFilmFile(slug, "master.m3u8");
  const master = masterFile && text(masterFile);
  const listed = master ? listedSubtitles(master) : [];
  if (!master || !listed.includes(lang)) throw new HttpError(404, "not_found", "No subtitles in that language");
  await writeFilmFile(slug, "master.m3u8", withSubtitles(master, listed.filter((l) => l !== lang)));
  await deleteFilmFile(slug, `subs_${lang}.m3u8`);
  await deleteFilmFile(slug, `subs_${lang}.vtt`);
  return listSubtitles(slug);
}
