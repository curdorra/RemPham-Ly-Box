import { createHmac } from "node:crypto";
import { config } from "../config.js";

/**
 * Produces a time-limited manifest URL. When CDN_SIGNING_KEY is set, appends an
 * `exp` + HMAC-SHA256 `sig` over "<path>:<exp>" that a CDN edge function (or
 * token-auth feature) can verify before serving segments. Without a key the
 * origin URL is returned untouched — fine for public test streams in dev.
 */
export function signManifestUrl(manifestUrl: string, now = Date.now()) {
  const expiresAt = new Date(now + config.PLAYBACK_TTL_SEC * 1000);
  if (!config.CDN_SIGNING_KEY) return { url: manifestUrl, expiresAt };

  const url = new URL(manifestUrl);
  const exp = Math.floor(expiresAt.getTime() / 1000).toString();
  const sig = createHmac("sha256", config.CDN_SIGNING_KEY)
    .update(`${url.pathname}:${exp}`)
    .digest("base64url");
  url.searchParams.set("exp", exp);
  url.searchParams.set("sig", sig);
  return { url: url.toString(), expiresAt };
}
