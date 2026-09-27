import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

describe("signManifestUrl", () => {
  it("returns the origin URL untouched without a signing key", async () => {
    const { signManifestUrl } = await import("../src/lib/playback.js");
    const { url } = signManifestUrl("https://cdn.example.com/v/abc/master.m3u8");
    expect(url).toBe("https://cdn.example.com/v/abc/master.m3u8");
  });

  it("appends a verifiable HMAC signature when a key is set", async () => {
    vi.resetModules();
    vi.stubEnv("CDN_SIGNING_KEY", "k3y");
    const { signManifestUrl } = await import("../src/lib/playback.js");
    const now = 1_700_000_000_000;
    const { url, expiresAt } = signManifestUrl("https://cdn.example.com/v/abc/master.m3u8", now);

    const parsed = new URL(url);
    const exp = parsed.searchParams.get("exp")!;
    expect(Number(exp)).toBe(Math.floor(expiresAt.getTime() / 1000));
    const expected = createHmac("sha256", "k3y").update(`/v/abc/master.m3u8:${exp}`).digest("base64url");
    expect(parsed.searchParams.get("sig")).toBe(expected);
    vi.unstubAllEnvs();
  });
});
