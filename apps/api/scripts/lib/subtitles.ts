/**
 * Subtitle renditions for a packaged HLS film. Each language becomes one
 * WebVTT file plus a one-segment playlist, listed in master.m3u8 as
 * EXT-X-MEDIA TYPE=SUBTITLES, so Safari and hls.js both offer them and the
 * media Worker signs their URLs like any other file in the folder.
 */

export type SubtitleInput = { lang: string; text: string };

const NAMES: Record<string, string> = { en: "English", lus: "Mizo" };
const GROUP = "subs";

/** Parses "en=path.srt" CLI arguments. */
export function parseSubArg(arg: string): { lang: string; path: string } {
  const m = arg.match(/^([a-z]{2,3}(?:-[A-Za-z0-9]+)?)=(.+)$/);
  if (!m) throw new Error(`Subtitles go as <lang>=<file>, e.g. en=film.en.srt or lus=film.lus.vtt (got "${arg}")`);
  return { lang: m[1], path: m[2] };
}

/**
 * SRT or WebVTT in, WebVTT out, stamped with the stream's starting PTS so cues
 * line up with MPEG-TS segments (ffmpeg starts them at ~1.4s, not 0).
 */
export function toWebVtt(text: string, startPts: number): string {
  const body = text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^WEBVTT[^\n]*\n(?:X-TIMESTAMP-MAP[^\n]*\n)?/, "")
    // SRT uses a comma before the milliseconds; WebVTT a dot.
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .trim();
  return `WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:${startPts},LOCAL:00:00:00.000\n\n${body}\n`;
}

/** Total length of a media playlist, from its EXTINF lines. */
export function playlistDuration(m3u8: string): number {
  return [...m3u8.matchAll(/#EXTINF:([\d.]+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
}

/** The files to upload for each language, keyed by file name. */
export function subtitleFiles(subs: SubtitleInput[], durationSec: number, startPts: number): Record<string, string> {
  const files: Record<string, string> = {};
  const target = Math.ceil(durationSec);
  for (const { lang, text } of subs) {
    files[`subs_${lang}.vtt`] = toWebVtt(text, startPts);
    files[`subs_${lang}.m3u8`] = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${target}`,
      "#EXT-X-PLAYLIST-TYPE:VOD",
      `#EXTINF:${durationSec.toFixed(3)},`,
      `subs_${lang}.vtt`,
      "#EXT-X-ENDLIST",
      "",
    ].join("\n");
  }
  return files;
}

/**
 * Lists the subtitle languages in master.m3u8: replaces any earlier subtitle
 * renditions and points every variant at the group. Run again with a new list
 * to add or replace a language.
 */
export function withSubtitles(master: string, langs: string[]): string {
  const lines = master
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !l.startsWith("#EXT-X-MEDIA:TYPE=SUBTITLES"))
    .map((l) => (l.startsWith("#EXT-X-STREAM-INF:") ? l.replace(/,SUBTITLES="[^"]*"/, "") : l));
  if (!langs.length) return lines.join("\n");

  const media = langs.map(
    (lang) =>
      `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="${GROUP}",NAME="${NAMES[lang] ?? lang}",LANGUAGE="${lang}",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="subs_${lang}.m3u8"`,
  );
  const out: string[] = [];
  let inserted = false;
  for (const l of lines) {
    if (!inserted && l.startsWith("#EXT-X-STREAM-INF:")) {
      out.push(...media);
      inserted = true;
    }
    out.push(l.startsWith("#EXT-X-STREAM-INF:") ? `${l},SUBTITLES="${GROUP}"` : l);
  }
  return out.join("\n");
}

/** Languages already listed in a master playlist. */
export function listedSubtitles(master: string): string[] {
  return [...master.matchAll(/#EXT-X-MEDIA:TYPE=SUBTITLES[^\n]*LANGUAGE="([^"]+)"/g)].map((m) => m[1]);
}

/** Reads "start: 1.400000" from ffmpeg's stderr and converts it to 90kHz ticks. */
export function startPtsFromProbe(stderr: string): number {
  const m = stderr.match(/start: ([\d.]+)/);
  return m ? Math.round(Number(m[1]) * 90_000) : 0;
}
