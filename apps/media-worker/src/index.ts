/**
 * Cloudflare Worker in front of the R2 bucket. Films are only served with a
 * valid `exp` + `sig` from POST /playback (apps/api/src/lib/playback.ts): an
 * HMAC-SHA256 over "<dir>:<exp>", where <dir> is the film's folder.
 *
 * hls.js drops the query string when it resolves the relative URLs inside a
 * playlist, so playlists are rewritten here to carry the token onto every
 * variant playlist and segment.
 */

// The slice of the R2 binding this Worker uses (full types: @cloudflare/workers-types).
type R2Range = { offset: number; length?: number } | { offset?: number; length: number } | { suffix: number };
export interface R2Object {
  size: number;
  httpEtag: string;
  range?: R2Range;
  writeHttpMetadata(headers: Headers): void;
}
export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  text(): Promise<string>;
}
export interface R2Bucket {
  get(key: string, options?: { range?: Headers; onlyIf?: Headers }): Promise<R2ObjectBody | R2Object | null>;
}

export interface Env {
  MEDIA: R2Bucket;
  /** Same value as the API's CDN_SIGNING_KEY. */
  SIGNING_KEY: string;
  /** Comma-separated web origins allowed to play films. */
  ALLOWED_ORIGINS: string;
}

const GATED = "/films/";
const PLAYLIST = "application/vnd.apple.mpegurl";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "GET" && req.method !== "HEAD") return text(405, "Method not allowed", cors);

    const gated = url.pathname.startsWith(GATED);
    if (gated) {
      // Fail closed: without a key nothing under /films/ is served.
      if (!env.SIGNING_KEY) return text(503, "Playback is not configured", cors);
      if (!(await tokenValid(url, env.SIGNING_KEY))) return text(403, "This link has expired. Reopen the film to keep watching.", cors);
    }

    let key: string;
    try {
      key = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return text(400, "Bad path", cors);
    }
    const isPlaylist = key.endsWith(".m3u8");
    // Playlists are rewritten whole, so they ignore Range.
    const obj = await env.MEDIA.get(key, isPlaylist ? {} : { range: req.headers, onlyIf: req.headers });
    if (!obj) return text(404, "Not found", cors);

    const headers = new Headers(cors);
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    if (!("body" in obj)) return new Response(null, { status: 304, headers });

    if (isPlaylist && gated) {
      const signed = rewritePlaylist(await obj.text(), url.searchParams.get("exp")!, url.searchParams.get("sig")!);
      const body = withKeyUrl(signed, keyOrigin(req, env), url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1));
      headers.set("content-type", PLAYLIST);
      // Carries the viewer's token, so it must never be shared from a cache.
      headers.set("cache-control", "private, no-store");
      headers.delete("etag");
      return new Response(req.method === "HEAD" ? null : body, { headers });
    }

    headers.set("accept-ranges", "bytes");
    let status = 200;
    if (req.headers.has("range") && obj.range) {
      const [offset, length] = span(obj.range, obj.size);
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
      headers.set("content-length", String(length));
      status = 206;
    } else {
      headers.set("content-length", String(obj.size));
    }
    return new Response(req.method === "HEAD" ? null : obj.body, { status, headers });
  },
};

/** Checks `sig` against "<dir>:<exp>" for the requested file's folder. */
async function tokenValid(url: URL, secret: string): Promise<boolean> {
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < Date.now()) return false;

  const sigBytes = fromBase64Url(sig);
  if (!sigBytes) return false;
  const dir = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
  const enc = new TextEncoder();
  // subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", await hmacKey(secret), sigBytes, enc.encode(`${dir}:${exp}`));
}

let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;
function hmacKey(secret: string) {
  if (cachedKey?.secret !== secret) {
    const raw = new TextEncoder().encode(secret);
    cachedKey = { secret, key: crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]) };
  }
  return cachedKey.key;
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Appends the token to every relative URI in a playlist: plain URI lines
 * (variants, segments) and URI="…" attributes (EXT-X-MEDIA, -MAP, -KEY).
 * Absolute and root-relative URIs point outside this folder and are left as-is.
 */
export function rewritePlaylist(body: string, exp: string, sig: string): string {
  const token = `exp=${exp}&sig=${sig}`;
  const sign = (uri: string) =>
    /^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith("/") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}${token}`;

  return body
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${sign(uri)}"`);
      return line.replace(t, sign(t));
    })
    .join("\n");
}

/** Must match KEY_URI_PLACEHOLDER in apps/api/src/lib/film-keys.ts. */
const KEY_PLACEHOLDER = 'URI="rpl-key:film"';

/**
 * Points an encrypted playlist's EXT-X-KEY at the web origin's /api/playback/key,
 * which only answers a signed-in viewer who is watching. Same-origin for the
 * player, so the login cookie goes with it.
 */
export function withKeyUrl(body: string, origin: string, dir: string): string {
  return body.replaceAll(KEY_PLACEHOLDER, `URI="${origin}/api/playback/key?dir=${encodeURIComponent(dir)}"`);
}

/** The site that's playing (hls.js sends Origin), else the first allowed one (Safari's native player doesn't). */
function keyOrigin(req: Request, env: Env): string {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  const origin = req.headers.get("origin");
  return origin && allowed.includes(origin) ? origin : allowed[0]!;
}

function span(r: R2Range, size: number): [offset: number, length: number] {
  if ("suffix" in r) return [size - r.suffix, r.suffix];
  const offset = r.offset ?? 0;
  return [offset, r.length ?? size - offset];
}

function corsHeaders(req: Request, env: Env): Headers {
  const h = new Headers({ vary: "Origin" });
  const origin = req.headers.get("origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  if (origin && allowed.includes(origin)) {
    h.set("access-control-allow-origin", origin);
    h.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
    h.set("access-control-allow-headers", "Range");
    h.set("access-control-expose-headers", "Content-Length, Content-Range");
    h.set("access-control-max-age", "86400");
  }
  return h;
}

function text(status: number, message: string, headers: Headers): Response {
  const h = new Headers(headers);
  h.set("content-type", "text/plain; charset=utf-8");
  h.set("cache-control", "no-store");
  return new Response(message, { status, headers: h });
}
