import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminTitle, AdminVideo, TitleInput, VideoUploadTarget } from "@ott/shared";
import { prisma } from "../src/lib/db.js";
import { finishedSegments, ffmpegProgress } from "../src/lib/film-package.js";
import { LOCAL_UPLOAD_DIR } from "../src/lib/media.js";
import { recoverJobs, runNextJob } from "../src/lib/video-jobs.js";
import { signUp, uniq } from "./helpers.js";

const ffmpeg: string = createRequire(import.meta.url)("ffmpeg-static");
const work = mkdtempSync(join(tmpdir(), "rlb-video-"));
let clip: Buffer;
let admin: Awaited<ReturnType<typeof signUp>>["agent"];
const cleanup: string[] = [work];

beforeAll(async () => {
  const r = spawnSync(
    ffmpeg,
    ["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=24:duration=3", "-f", "lavfi", "-i", "sine=duration=3", "-c:v", "libx264", "-c:a", "aac", join(work, "clip.mp4")],
    { encoding: "utf8" },
  );
  expect(r.status).toBe(0);
  clip = readFileSync(join(work, "clip.mp4"));
  const user = await signUp();
  await prisma.user.update({ where: { email: user.email }, data: { role: "ADMIN" } });
  admin = user.agent;
});

afterAll(async () => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

async function film(over: Partial<TitleInput> = {}) {
  const slug = `upload-film-${uniq()}`;
  const input = {
    slug, type: "MOVIE", name: "Upload", synopsis: "x", year: 2026, maturity: "PG",
    posterUrl: "https://example.com/p.jpg", backdropUrl: "https://example.com/b.jpg",
    genres: ["Drama"], cast: [], pricePaise: 9900, rentalHours: 48,
    ...over,
  } as TitleInput;
  const t: AdminTitle = (await admin.post("/admin/titles").send(input).expect(201)).body;
  cleanup.push(join(LOCAL_UPLOAD_DIR, "films", slug), join(LOCAL_UPLOAD_DIR, "incoming", t.id));
  return { id: t.id, slug, dir: join(LOCAL_UPLOAD_DIR, "films", slug) };
}

/** What the browser does: start, send each part, complete. */
async function upload(id: string, body: Buffer, fileName = "film.mp4"): Promise<AdminVideo> {
  const target: VideoUploadTarget = (await admin.post(`/admin/titles/${id}/video/uploads`).send({ fileName, sizeBytes: body.length }).expect(201)).body;
  const parts = [];
  for (const p of target.parts) {
    const chunk = body.subarray((p.partNumber - 1) * target.partSize, p.partNumber * target.partSize);
    const res = await admin.put(p.url.replace(/^\/api/, "")).set("content-type", "application/octet-stream").send(chunk).expect(204);
    parts.push({ partNumber: p.partNumber, etag: res.headers.etag });
  }
  return (await admin.post(`/admin/titles/${id}/video/complete`).send({ parts }).expect(200)).body;
}

const segments = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".ts"));

describe("film video uploads", () => {
  it("uploads, queues, converts and points the title at the new stream", async () => {
    const f = await film();
    const queued = await upload(f.id, clip);
    expect(queued).toMatchObject({ status: "QUEUED", fileName: "film.mp4", sizeBytes: clip.length });
    expect((await admin.get(`/admin/titles/${f.id}`).expect(200)).body.video.status).toBe("QUEUED");

    // Nothing new while it waits to convert.
    await admin.post(`/admin/titles/${f.id}/video/uploads`).send({ fileName: "b.mp4", sizeBytes: 10 }).expect(409);

    expect(await runNextJob()).toBe(true);
    const video: AdminVideo = (await admin.get(`/admin/titles/${f.id}/video`).expect(200)).body;
    expect(video).toMatchObject({ status: "READY", progress: 100, error: null });

    const title: AdminTitle = (await admin.get(`/admin/titles/${f.id}`).expect(200)).body;
    expect(title.manifestUrl).toBe(`/api/uploads/films/${f.slug}/master.m3u8`);
    expect(title.durationSec).toBe(3);
    expect(readFileSync(join(f.dir, "master.m3u8"), "utf8")).toContain("v720p.m3u8");
    expect(JSON.parse(readFileSync(join(f.dir, "package.json"), "utf8"))).toMatchObject({ variants: ["360p", "540p", "720p"] });
    // Every segment the playlists name was uploaded.
    for (const q of ["360p", "540p", "720p"]) {
      const listed = readFileSync(join(f.dir, `v${q}.m3u8`), "utf8").split("\n").filter((l) => l.endsWith(".ts"));
      expect(listed.length).toBeGreaterThan(0);
      for (const s of listed) expect(existsSync(join(f.dir, s))).toBe(true);
    }
    // Encrypted (vitest sets CONTENT_KEY_SECRET), and the key itself never goes up.
    expect(readFileSync(join(f.dir, "v360p.m3u8"), "utf8")).toMatch(/#EXT-X-KEY:METHOD=AES-128,URI="rpl-key:film",IV=0x/);
    expect(readdirSync(f.dir).some((n) => n.endsWith(".key") || n === "keyinfo")).toBe(false);
    // The original is removed once converted.
    expect(readdirSync(join(LOCAL_UPLOAD_DIR, "incoming", f.id))).toEqual([]);
  });

  it("replacing a film keeps its subtitles and drops the old segments", async () => {
    const f = await film();
    await upload(f.id, clip);
    await runNextJob();
    await admin.put(`/admin/titles/${f.id}/subtitles/en`).set("content-type", "text/plain").send("1\n00:00:01,000 --> 00:00:02,000\nKan lawm\n").expect(200);
    const before = segments(f.dir);

    await upload(f.id, clip, "film-v2.mov");
    await runNextJob();
    const after = segments(f.dir);
    expect(after.length).toBe(before.length);
    expect(after.some((s) => before.includes(s))).toBe(false);
    expect(readFileSync(join(f.dir, "master.m3u8"), "utf8")).toContain('LANGUAGE="en"');
    const vtt = readFileSync(join(f.dir, "subs_en.vtt"), "utf8");
    expect(vtt.match(/X-TIMESTAMP-MAP/g)).toHaveLength(1);
    expect(vtt).toContain("Kan lawm");
  });

  it("marks a file ffmpeg can't read as failed, keeps it, and converts it again on retry", async () => {
    const f = await film();
    await upload(f.id, Buffer.from("not a video at all"));
    await runNextJob();
    const failed: AdminVideo = (await admin.get(`/admin/titles/${f.id}/video`).expect(200)).body;
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toMatch(/couldn't convert/);
    expect(readdirSync(join(LOCAL_UPLOAD_DIR, "incoming", f.id))).toHaveLength(1);
    expect((await admin.get(`/admin/titles/${f.id}`).expect(200)).body.manifestUrl).toBeNull();

    expect((await admin.post(`/admin/titles/${f.id}/video/retry`).expect(200)).body.status).toBe("QUEUED");
    await runNextJob();
    // A new upload replaces the failed one and removes its original.
    await upload(f.id, clip);
    expect(readdirSync(join(LOCAL_UPLOAD_DIR, "incoming", f.id))).toHaveLength(1);
    await runNextJob();
  });

  it("joins a file sent in several parts", async () => {
    const f = await film();
    const big = Buffer.alloc(17 * 1024 * 1024, 7);
    await upload(f.id, big);
    const [source] = readdirSync(join(LOCAL_UPLOAD_DIR, "incoming", f.id));
    expect(readFileSync(join(LOCAL_UPLOAD_DIR, "incoming", f.id, source!)).equals(big)).toBe(true);
    await runNextJob();
    expect((await admin.get(`/admin/titles/${f.id}/video`).expect(200)).body.error).not.toContain(LOCAL_UPLOAD_DIR);
  });

  it("cancels an upload in progress", async () => {
    const f = await film();
    await admin.post(`/admin/titles/${f.id}/video/uploads`).send({ fileName: "a.mp4", sizeBytes: 100 }).expect(201);
    expect((await admin.get(`/admin/titles/${f.id}/video`).expect(200)).body.status).toBe("UPLOADING");
    await admin.post(`/admin/titles/${f.id}/video/complete`).send({ parts: [{ partNumber: 1, etag: '"1"' }] }).expect(409);
    await admin.delete(`/admin/titles/${f.id}/video/upload`).expect(204);
    expect((await admin.get(`/admin/titles/${f.id}/video`).expect(200)).body).toBeNull();
  });

  it("is for films only, and staff only", async () => {
    const series = await film({ type: "SERIES" });
    await admin.post(`/admin/titles/${series.id}/video/uploads`).send({ fileName: "a.mp4", sizeBytes: 100 }).expect(400);
    const f = await film();
    const viewer = await signUp();
    await viewer.agent.post(`/admin/titles/${f.id}/video/uploads`).send({ fileName: "a.mp4", sizeBytes: 100 }).expect(403);
  });

  it("puts interrupted conversions back in the queue, up to a limit", async () => {
    const a = await film();
    const b = await film();
    const job = { fileName: "a.mp4", sizeBytes: 1n, sourceKey: "incoming/x/y.mp4" };
    await prisma.videoJob.create({ data: { titleId: a.id, status: "CONVERTING", attempts: 1, ...job } });
    await prisma.videoJob.create({ data: { titleId: b.id, status: "CONVERTING", attempts: 3, ...job } });
    await recoverJobs();
    expect((await prisma.videoJob.findUniqueOrThrow({ where: { titleId: a.id } })).status).toBe("QUEUED");
    expect((await prisma.videoJob.findUniqueOrThrow({ where: { titleId: b.id } })).status).toBe("FAILED");
    await prisma.videoJob.deleteMany({ where: { titleId: { in: [a.id, b.id] } } });
  });
});

describe("conversion helpers", () => {
  it("only sends a segment once a newer one of the same quality exists", () => {
    const files = ["t_360p_0000.ts", "t_360p_0001.ts", "t_720p_0000.ts", "v360p.m3u8"];
    expect(finishedSegments(files, false)).toEqual(["t_360p_0000.ts"]);
    expect(finishedSegments(files, true)).toEqual(["t_360p_0000.ts", "t_360p_0001.ts", "t_720p_0000.ts"]);
  });

  it("reads progress from ffmpeg's log", () => {
    const log = "  Duration: 01:00:00.00, start: 0.0\nframe= 10 time=00:15:00.00 bitrate\rframe= 20 time=00:30:00.00 bitrate";
    expect(ffmpegProgress(log)).toBe(0.5);
    expect(ffmpegProgress("time=00:01:00.00")).toBeNull();
  });
});
