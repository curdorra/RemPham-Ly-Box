import { describe, expect, it } from "vitest";
import {
  listedSubtitles,
  parseSubArg,
  playlistDuration,
  startPtsFromProbe,
  subtitleFiles,
  toWebVtt,
  withSubtitles,
} from "../src/lib/subtitles.js";

// As ffmpeg writes it in publish-film.
const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=985600,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"
v360p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=3220800,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
v720p.m3u8
`;

describe("subtitles for publish-film", () => {
  it("turns SRT into WebVTT stamped with the stream's start", () => {
    const srt = "﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nChibai!\r\n";
    expect(toWebVtt(srt, 131410)).toBe(
      "WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:131410,LOCAL:00:00:00.000\n\n1\n00:00:01.500 --> 00:00:03.000\nChibai!\n",
    );
  });

  it("re-stamps a WebVTT file instead of doubling its header", () => {
    const vtt = "WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000\n\n00:00:01.000 --> 00:00:02.000\nHi\n";
    const out = toWebVtt(vtt, 900);
    expect(out.match(/WEBVTT/g)).toHaveLength(1);
    expect(out).toContain("MPEGTS:900,");
  });

  it("lists languages in the master and points every variant at them", () => {
    const out = withSubtitles(MASTER, ["en", "lus"]);
    expect(listedSubtitles(out)).toEqual(["en", "lus"]);
    expect(out).toContain('NAME="Mizo",LANGUAGE="lus"');
    expect(out).toContain('URI="subs_en.m3u8"');
    expect(out.match(/SUBTITLES="subs"/g)).toHaveLength(2);
    // Renditions come before the first variant.
    expect(out.indexOf("TYPE=SUBTITLES")).toBeLessThan(out.indexOf("#EXT-X-STREAM-INF"));
  });

  it("can run again on its own output without duplicating anything", () => {
    const once = withSubtitles(MASTER, ["en"]);
    const twice = withSubtitles(once, ["en", "lus"]);
    expect(listedSubtitles(twice)).toEqual(["en", "lus"]);
    expect(twice.match(/SUBTITLES="subs"/g)).toHaveLength(2);
    expect(withSubtitles(twice, [])).toBe(MASTER);
  });

  it("writes a one-segment playlist covering the whole film", () => {
    const files = subtitleFiles([{ lang: "en", text: "1\n00:00:01,000 --> 00:00:02,000\nHi" }], 9.6, 0);
    expect(Object.keys(files).sort()).toEqual(["subs_en.m3u8", "subs_en.vtt"]);
    expect(files["subs_en.m3u8"]).toContain("#EXT-X-TARGETDURATION:10\n");
    expect(files["subs_en.m3u8"]).toContain("#EXTINF:9.600,\nsubs_en.vtt\n#EXT-X-ENDLIST");
  });

  it("reads durations, start times and CLI arguments", () => {
    expect(playlistDuration("#EXTINF:4.000000,\na.ts\n#EXTINF:1.5,\nb.ts\n")).toBeCloseTo(5.5);
    expect(startPtsFromProbe("Duration: 00:00:04.00, start: 1.460111, bitrate: 1 kb/s")).toBe(131410);
    expect(parseSubArg("lus=/tmp/a=b.srt")).toEqual({ lang: "lus", path: "/tmp/a=b.srt" });
    expect(() => parseSubArg("film.srt")).toThrow(/<lang>=<file>/);
  });
});
