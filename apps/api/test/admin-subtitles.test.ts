import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminSubtitles, AdminTitle, TitleInput } from "@ott/shared";
import { prisma } from "../src/lib/db.js";
import { LOCAL_UPLOAD_DIR } from "../src/lib/media.js";
import { startPtsFromProbe, startPtsFromTs } from "../src/lib/subtitles.js";
import { app, signUp, uniq } from "./helpers.js";

const ffmpeg: string = createRequire(import.meta.url)("ffmpeg-static");
const work = mkdtempSync(join(tmpdir(), "rlb-subs-"));
let segment: Buffer;
let probedPts: number;

beforeAll(() => {
  // Two seconds of video and audio as one TS segment, the way publish-film makes them.
  const r = spawnSync(
    ffmpeg,
    ["-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=24:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-c:a", "aac",
     "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_segment_filename", join(work, "seg%d.ts"), join(work, "v.m3u8")],
    { encoding: "utf8" },
  );
  expect(r.status).toBe(0);
  segment = readFileSync(join(work, "seg0.ts"));
  probedPts = startPtsFromProbe(spawnSync(ffmpeg, ["-hide_banner", "-i", join(work, "seg0.ts")], { encoding: "utf8" }).stderr);
});

afterAll(async () => {
  rmSync(work, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("startPtsFromTs", () => {
  it("agrees with ffmpeg's own reading of the segment", () => {
    expect(probedPts).toBeGreaterThan(0);
    expect(Math.abs(startPtsFromTs(segment) - probedPts)).toBeLessThanOrEqual(1);
  });

  it("refuses something that isn't MPEG-TS", () => {
    expect(() => startPtsFromTs(Buffer.alloc(376))).toThrow();
  });
});

const SRT = "1\n00:00:01,000 --> 00:00:02,500\nKan lawm\n\n";
const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=985600,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"
v360p.m3u8
`;

async function staffAgent() {
  const user = await signUp();
  await prisma.user.update({ where: { email: user.email }, data: { role: "ADMIN" } });
  return user.agent;
}

async function film(admin: Awaited<ReturnType<typeof staffAgent>>, over: Partial<TitleInput> = {}) {
  const slug = `subs-film-${uniq()}`;
  const input = {
    slug, type: "MOVIE", name: "Subs", synopsis: "x", year: 2026, maturity: "PG",
    posterUrl: "https://example.com/p.jpg", backdropUrl: "https://example.com/b.jpg",
    genres: ["Drama"], cast: [], durationSec: 60, manifestUrl: "https://cdn.example.com/m.m3u8", pricePaise: 9900, rentalHours: 48,
    ...over,
  } as TitleInput;
  const t: AdminTitle = (await admin.post("/admin/titles").send(input).expect(201)).body;
  return { id: t.id, slug, dir: join(LOCAL_UPLOAD_DIR, "films", slug) };
}

/** A packaged film on the local store, optionally with the package.json publish-film writes. */
function packageFilm(dir: string, withPackage: boolean) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "master.m3u8"), MASTER);
  writeFileSync(join(dir, "v360p.m3u8"), "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:2.000,\nv360p_0000.ts\n#EXT-X-ENDLIST\n");
  writeFileSync(join(dir, "v360p_0000.ts"), segment);
  if (withPackage) writeFileSync(join(dir, "package.json"), JSON.stringify({ startPts: 126000, durationSec: 2, variants: ["360p"] }));
}

describe("admin subtitles", () => {
  it("is staff only", async () => {
    const { agent } = await signUp();
    await agent.get("/admin/titles/whatever/subtitles").expect(403);
    await agent.put("/admin/titles/whatever/subtitles/en").send(SRT).expect(403);
    await agent.delete("/admin/titles/whatever/subtitles/en").expect(403);
    await request(app).get("/admin/titles/whatever/subtitles").expect(401);
  });

  it("says there is no video before the film is packaged, and refuses uploads", async () => {
    const admin = await staffAgent();
    const { id } = await film(admin);
    expect((await admin.get(`/admin/titles/${id}/subtitles`).expect(200)).body).toEqual({ hasVideo: false, languages: [] });
    await admin.put(`/admin/titles/${id}/subtitles/en`).set("Content-Type", "text/plain").send(SRT).expect(409);
  });

  it("adds, lists, replaces and removes languages, reading the PTS from package.json", async () => {
    const admin = await staffAgent();
    const { id, dir } = await film(admin);
    packageFilm(dir, true);
    const put = (lang: string, body: string) => admin.put(`/admin/titles/${id}/subtitles/${lang}`).set("Content-Type", "text/plain").send(body);

    const en: AdminSubtitles = (await put("en", SRT).expect(200)).body;
    expect(en.languages).toEqual([{ lang: "en", name: "English" }]);
    const vtt = readFileSync(join(dir, "subs_en.vtt"), "utf8");
    expect(vtt).toContain("X-TIMESTAMP-MAP=MPEGTS:126000,LOCAL:00:00:00.000");
    expect(vtt).toContain("00:00:01.000 --> 00:00:02.500");

    const both: AdminSubtitles = (await put("lus", SRT.replace("Kan lawm", "Ka lawm")).expect(200)).body;
    expect(both.languages.map((l) => l.lang)).toEqual(["en", "lus"]);
    expect(readFileSync(join(dir, "master.m3u8"), "utf8")).toContain('SUBTITLES="subs"');

    await put("en", SRT.replace("Kan lawm", "Replaced")).expect(200);
    expect(readFileSync(join(dir, "subs_en.vtt"), "utf8")).toContain("Replaced");
    expect((await admin.get(`/admin/titles/${id}/subtitles`).expect(200)).body.languages).toHaveLength(2);

    const left: AdminSubtitles = (await admin.delete(`/admin/titles/${id}/subtitles/en`).expect(200)).body;
    expect(left.languages.map((l) => l.lang)).toEqual(["lus"]);
    expect(() => readFileSync(join(dir, "subs_en.vtt"))).toThrow();
    await admin.delete(`/admin/titles/${id}/subtitles/en`).expect(404);
    rmSync(dir, { recursive: true, force: true });
  });

  it("works out the PTS from the first segment for films published before package.json", async () => {
    const admin = await staffAgent();
    const { id, dir } = await film(admin);
    packageFilm(dir, false);
    await admin.put(`/admin/titles/${id}/subtitles/en`).set("Content-Type", "text/plain").send(SRT).expect(200);
    const mapped = Number(readFileSync(join(dir, "subs_en.vtt"), "utf8").match(/MPEGTS:(\d+)/)![1]);
    expect(Math.abs(mapped - probedPts)).toBeLessThanOrEqual(1);
    const written = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(written.variants).toEqual(["360p"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects unknown languages, non-subtitle files and series", async () => {
    const admin = await staffAgent();
    const { id, dir } = await film(admin);
    packageFilm(dir, true);
    const put = (lang: string, body: string) => admin.put(`/admin/titles/${id}/subtitles/${lang}`).set("Content-Type", "text/plain").send(body);
    await put("fr", SRT).expect(400);
    await put("en", "just some words").expect(400);
    await put("en", "   ").expect(400);
    rmSync(dir, { recursive: true, force: true });

    const series = await film(admin, { type: "SERIES", manifestUrl: undefined });
    await admin.get(`/admin/titles/${series.id}/subtitles`).expect(400);
  });
});
