import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import worker, { rewritePlaylist, type Env, type R2Bucket, type R2Object, type R2ObjectBody } from "../src/index";

const KEY = "k3y";
const ORIGIN = "https://remphamly.com";

/** Signs exactly like apps/api/src/lib/playback.ts. */
function token(dir: string, exp = Math.floor(Date.now() / 1000) + 3600, key = KEY) {
  const sig = createHmac("sha256", key).update(`${dir}:${exp}`).digest("base64url");
  return `exp=${exp}&sig=${sig}`;
}

const MASTER = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nv0.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2800000\nv2.m3u8\n";
const SEGMENT = new TextEncoder().encode("0123456789");

/** In-memory stand-in for the R2 binding, with simple "bytes=a-b" ranges. */
function bucket(files: Record<string, { body: string | Uint8Array; type: string }>): R2Bucket {
  return {
    async get(key, options) {
      const f = files[key];
      if (!f) return null;
      const bytes = typeof f.body === "string" ? new TextEncoder().encode(f.body) : f.body;
      const m = options?.range?.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
      const offset = m ? Number(m[1]) : 0;
      const end = m && m[2] ? Number(m[2]) + 1 : bytes.length;
      const slice = bytes.slice(offset, end);
      const obj: R2ObjectBody = {
        size: bytes.length,
        httpEtag: `"${key}"`,
        range: m ? { offset, length: slice.length } : undefined,
        writeHttpMetadata: (h) => h.set("content-type", f.type),
        body: new Blob([slice]).stream(),
        text: async () => new TextDecoder().decode(slice),
      };
      return obj as R2Object | R2ObjectBody;
    },
  };
}

const env: Env = {
  SIGNING_KEY: KEY,
  ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:3000`,
  MEDIA: bucket({
    "films/dune/master.m3u8": { body: MASTER, type: "application/vnd.apple.mpegurl" },
    "films/dune/v0_0000.ts": { body: SEGMENT, type: "video/mp2t" },
    "artwork/poster/a.jpg": { body: "jpg", type: "image/jpeg" },
  }),
};

const get = (path: string, init?: RequestInit, e = env) => worker.fetch(new Request(`https://media.remphamly.com${path}`, init), e);

describe("media worker", () => {
  it("serves a signed playlist with the token on every child URL", async () => {
    const t = token("/films/dune/");
    const res = await get(`/films/dune/master.m3u8?${t}`, { headers: { origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const body = await res.text();
    expect(body).toContain(`\nv0.m3u8?${t}\n`);
    expect(body).toContain(`\nv2.m3u8?${t}\n`);
  });

  it("serves segments in the same folder with the same token, honouring Range", async () => {
    const t = token("/films/dune/");
    const res = await get(`/films/dune/v0_0000.ts?${t}`, { headers: { range: "bytes=2-5" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await res.text()).toBe("2345");
  });

  it("refuses missing, forged, expired and other-film tokens", async () => {
    expect((await get("/films/dune/master.m3u8")).status).toBe(403);
    expect((await get(`/films/dune/master.m3u8?${token("/films/dune/", undefined, "wrong")}`)).status).toBe(403);
    expect((await get(`/films/dune/master.m3u8?${token("/films/dune/", Math.floor(Date.now() / 1000) - 1)}`)).status).toBe(403);
    expect((await get(`/films/dune/master.m3u8?${token("/films/other/")}`)).status).toBe(403);
    expect((await get("/films/dune/master.m3u8?exp=9999999999&sig=not*base64")).status).toBe(403);
  });

  it("fails closed when no signing key is configured", async () => {
    const res = await get(`/films/dune/master.m3u8?${token("/films/dune/")}`, undefined, { ...env, SIGNING_KEY: "" });
    expect(res.status).toBe(503);
  });

  it("leaves artwork public and ignores unknown origins for CORS", async () => {
    const res = await get("/artwork/poster/a.jpg", { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects writes and answers 404 for missing files", async () => {
    expect((await get("/films/dune/master.m3u8", { method: "PUT", body: "x" })).status).toBe(405);
    expect((await get(`/films/dune/nope.ts?${token("/films/dune/")}`)).status).toBe(404);
  });
});

describe("rewritePlaylist", () => {
  it("signs relative URIs and URI attributes, leaves absolute ones alone", () => {
    const out = rewritePlaylist(
      '#EXTM3U\r\n#EXT-X-MAP:URI="init.mp4"\r\nseg.ts?v=1\r\nhttps://other.cdn/x.ts\r\n/root.ts\r\n',
      "9",
      "s",
    );
    expect(out).toBe('#EXTM3U\r\n#EXT-X-MAP:URI="init.mp4?exp=9&sig=s"\r\nseg.ts?v=1&exp=9&sig=s\r\nhttps://other.cdn/x.ts\r\n/root.ts\r\n');
  });
});
