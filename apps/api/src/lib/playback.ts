import { createHmac } from "node:crypto";
import { config } from "../config.js";

/**
 * Produces a time-limited manifest URL. When CDN_SIGNING_KEY is set, appends an
 * `exp` + HMAC-SHA256 `sig` over "<dir>:<exp>", where <dir> is the manifest's
 * folder ("/films/<slug>/"). Signing the folder, not the file, lets one token
 * cover every variant playlist and segment; the media Worker
 * (apps/media-worker) verifies it and copies it onto each child URL. Without a
 * key the origin URL is returned untouched — fine for public test streams in dev.
 */
export function signManifestUrl(manifestUrl: string, now = Date.now()) {
  const expiresAt = new Date(now + config.PLAYBACK_TTL_SEC * 1000);
  if (!config.CDN_SIGNING_KEY) return { url: manifestUrl, expiresAt };

  const url = new URL(manifestUrl);
  const dir = manifestDir(manifestUrl);
  const exp = Math.floor(expiresAt.getTime() / 1000).toString();
  const sig = createHmac("sha256", config.CDN_SIGNING_KEY).update(`${dir}:${exp}`).digest("base64url");
  url.searchParams.set("exp", exp);
  url.searchParams.set("sig", sig);
  return { url: url.toString(), expiresAt };
}

/** A manifest's folder, e.g. "/films/<slug>/": what tokens and film keys are scoped to. */
export function manifestDir(manifestUrl: string) {
  const { pathname } = new URL(manifestUrl);
  return pathname.slice(0, pathname.lastIndexOf("/") + 1);
}
