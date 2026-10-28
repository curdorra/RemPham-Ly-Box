import { createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Films are packaged as AES-128 HLS. Each film's key is derived from
 * CONTENT_KEY_SECRET and its folder, so nothing has to be stored: publish-film
 * derives it to encrypt, GET /playback/key derives it again for a viewer who
 * is watching. Changing the secret makes every encrypted film unplayable.
 */

/**
 * The key URI publish-film writes into playlists. The media Worker swaps it for
 * the web origin's /api/playback/key URL, so one upload plays on every site.
 */
export const KEY_URI_PLACEHOLDER = "rpl-key:film";

/** The 16-byte AES key for a film folder ("/films/<slug>/"). */
export function filmKey(secret: string, dir: string): Buffer {
  return createHmac("sha256", secret).update(`aes128:${dir}`).digest().subarray(0, 16);
}

/** Lines of an ffmpeg -hls_key_info_file: key URI, key file path, IV. A fresh IV per film. */
export function keyInfo(keyFile: string, iv = randomBytes(16)): string {
  return `${KEY_URI_PLACEHOLDER}\n${keyFile}\n${iv.toString("hex")}\n`;
}

/** The IV from a variant playlist's EXT-X-KEY line, or null when the playlist isn't encrypted. */
export function playlistIv(playlist: string): Buffer | null {
  const line = playlist.split("\n").find((l) => l.startsWith("#EXT-X-KEY:") && l.includes("METHOD=AES-128"));
  if (!line) return null;
  const iv = line.match(/IV=0x([0-9a-f]{32})/i);
  // Without an IV attribute the media sequence number is the IV: zero for the first segment.
  return Buffer.from(iv ? iv[1] : "0".repeat(32), "hex");
}

export function decryptSegment(bytes: Buffer, key: Buffer, iv: Buffer): Buffer {
  const d = createDecipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([d.update(bytes), d.final()]);
}
