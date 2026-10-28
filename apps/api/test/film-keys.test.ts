import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";
import { KEY_URI_PLACEHOLDER, decryptSegment, filmKey, keyInfo, playlistIv } from "../src/lib/film-keys.js";
import { DEVICE, app, buy, signUp, uniq } from "./helpers.js";

const SECRET = "test-content-key";
const ffmpeg: string = createRequire(import.meta.url)("ffmpeg-static");

afterAll(() => prisma.$disconnect());

describe("film keys", () => {
  it("derives a stable 16-byte key per folder", () => {
    expect(filmKey(SECRET, "/films/a/")).toHaveLength(16);
    expect(filmKey(SECRET, "/films/a/")).toEqual(filmKey(SECRET, "/films/a/"));
    expect(filmKey(SECRET, "/films/a/")).not.toEqual(filmKey(SECRET, "/films/b/"));
    expect(filmKey("other", "/films/a/")).not.toEqual(filmKey(SECRET, "/films/a/"));
  });

  it("packages with ffmpeg the way publish-film does and decrypts back to MPEG-TS", () => {
    const work = mkdtempSync(join(tmpdir(), "rlb-keys-"));
    try {
      writeFileSync(join(work, "film.key"), filmKey(SECRET, "/films/a/"));
      writeFileSync(join(work, "keyinfo"), keyInfo(join(work, "film.key")));
      const r = spawnSync(
        ffmpeg,
        ["-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=24:duration=2", "-c:v", "libx264",
         "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_key_info_file", join(work, "keyinfo"),
         "-hls_segment_filename", join(work, "seg%d.ts"), join(work, "v.m3u8")],
        { encoding: "utf8" },
      );
      expect(r.status).toBe(0);
      const playlist = readFileSync(join(work, "v.m3u8"), "utf8");
      expect(playlist).toContain(`URI="${KEY_URI_PLACEHOLDER}"`);

      const seg = readFileSync(join(work, "seg0.ts"));
      expect(seg[0]).not.toBe(0x47);
      const clear = decryptSegment(seg, filmKey(SECRET, "/films/a/"), playlistIv(playlist)!);
      expect(clear[0]).toBe(0x47); // MPEG-TS sync byte
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("reads no IV from a clear playlist", () => {
    expect(playlistIv("#EXTM3U\n#EXTINF:2.0,\nseg0.ts\n")).toBeNull();
  });
});

describe("GET /playback/key", () => {
  async function encryptedFilm() {
    const slug = `key-film-${uniq()}`;
    const title = await prisma.title.create({
      data: {
        slug, type: "MOVIE", name: "Key film", synopsis: "x", year: 2026, maturity: "PG",
        posterUrl: "https://example.com/p.jpg", backdropUrl: "https://example.com/b.jpg",
        durationSec: 60, manifestUrl: `https://media.example.com/films/${slug}/master.m3u8`,
      },
    });
    return { title, dir: `/films/${slug}/` };
  }
  const keyUrl = (dir: string) => `/playback/key?dir=${encodeURIComponent(dir)}`;

  it("gives the key only to a signed-in ticket holder whose screen is playing", async () => {
    const { title, dir } = await encryptedFilm();
    await request(app).get(keyUrl(dir)).expect(401);

    const { agent } = await signUp();
    await agent.get(keyUrl(dir)).expect(403);

    const order = await buy(agent, { titleId: title.id });
    // Bought but not pressed play: no screen in use yet.
    await agent.get(keyUrl(dir)).expect(403);

    await agent.post("/playback").send({ titleId: title.id, deviceId: DEVICE }).expect(200);
    const res = await agent.get(keyUrl(dir)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.from(res.body as Buffer)).toEqual(filmKey(SECRET, dir));

    // Closing the player frees the screen, and the key with it.
    await agent.post("/playback/release").send({ ticketId: order.tickets[0]!.id, deviceId: DEVICE }).expect(204);
    await agent.get(keyUrl(dir)).expect(403);
  });

  it("refuses another film's folder and malformed folders", async () => {
    const { title } = await encryptedFilm();
    const other = await encryptedFilm();
    const { agent } = await signUp();
    await buy(agent, { titleId: title.id });
    await agent.post("/playback").send({ titleId: title.id, deviceId: DEVICE }).expect(200);

    await agent.get(keyUrl(other.dir)).expect(403);
    await agent.get(keyUrl("/films/../")).expect(404);
    await agent.get(keyUrl("/films/nope/")).expect(404);
    await agent.get("/playback/key").expect(404);
  });
});
