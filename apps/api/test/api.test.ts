import request from "supertest";
import { describe, expect, it } from "vitest";
import type { HomeFeed, PlaybackInfo, TitleSummary } from "@ott/shared";
import { DEVICE, app, buy, getTitle, signUp, userWithTicket } from "./helpers.js";

describe("auth", () => {
  it("signs up, reads /me, logs out", async () => {
    const { agent, email, me } = await signUp();
    expect(me.email).toBe(email);
    expect(me.role).toBe("VIEWER");

    const res = await agent.get("/auth/me").expect(200);
    expect(res.body.email).toBe(email);

    await agent.post("/auth/logout").expect(204);
    await agent.get("/auth/me").expect(401);
  });

  it("rejects duplicate email and bad credentials", async () => {
    const { email } = await signUp();
    await request(app).post("/auth/signup").send({ email, password: "whatever123", name: "X" }).expect(409);
    await request(app).post("/auth/login").send({ email, password: "wrong-password" }).expect(401);
    await request(app).post("/auth/login").send({ email: email.toUpperCase(), password: "correct-horse" }).expect(200);
  });

  it("validates input", async () => {
    const res = await request(app).post("/auth/signup").send({ email: "nope", password: "short", name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });
});

describe("catalog", () => {
  it("serves a home feed", async () => {
    const feed: HomeFeed = (await request(app).get("/catalog/home").expect(200)).body;
    expect(feed.hero).not.toBeNull();
    expect(feed.rows.length).toBeGreaterThan(0);
    expect(feed.rows.every((r) => r.titles.length > 0)).toBe(true);
  });

  it("searches and filters titles", async () => {
    const byName = await request(app).get("/catalog/titles").query({ q: "bunny" }).expect(200);
    expect(byName.body.items.map((t: TitleSummary) => t.slug)).toEqual(["big-buck-bunny"]);

    const series = await request(app).get("/catalog/titles").query({ type: "SERIES" }).expect(200);
    expect(series.body.items.every((t: TitleSummary) => t.type === "SERIES")).toBe(true);

    const docs = await request(app).get("/catalog/titles").query({ genre: "documentary" }).expect(200);
    expect(docs.body.total).toBeGreaterThanOrEqual(2);
  });

  it("returns title details with seasons, 404s for unknown slugs", async () => {
    const t = await getTitle("the-long-harbor");
    expect(t.seasons).toHaveLength(2);
    expect(t.seasons[0]!.episodes[0]!.number).toBe(1);
    await request(app).get("/catalog/titles/does-not-exist").expect(404);
  });

  it("never exposes manifest URLs in catalog responses", async () => {
    const res = await request(app).get("/catalog/titles/big-buck-bunny").expect(200);
    expect(JSON.stringify(res.body)).not.toContain(".m3u8");
  });
});

describe("playback entitlement", () => {
  it("requires sign-in, then a ticket", async () => {
    const movie = await getTitle("big-buck-bunny");
    await request(app).post("/playback").send({ titleId: movie.id, deviceId: DEVICE }).expect(401);

    const { agent } = await signUp();
    const res = await agent.post("/playback").send({ titleId: movie.id, deviceId: DEVICE });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("ticket_required");

    await buy(agent, { titleId: movie.id });
    const ok = await agent.post("/playback").send({ titleId: movie.id, deviceId: DEVICE }).expect(200);
    expect((ok.body as PlaybackInfo).manifestUrl).toMatch(/\.m3u8/);
  });

  it("a ticket for one title doesn't unlock another", async () => {
    const { agent } = await userWithTicket("big-buck-bunny");
    const other = await getTitle("signal-test");
    await agent.post("/playback").send({ titleId: other.id, deviceId: DEVICE }).expect(402);
  });

  it("resolves series episodes and the next episode", async () => {
    const { agent, title: show } = await userWithTicket("the-long-harbor");
    const s1 = show.seasons[0]!;
    const lastOfS1 = s1.episodes.at(-1)!;

    const first: PlaybackInfo = (await agent.post("/playback").send({ titleId: show.id, deviceId: DEVICE }).expect(200)).body;
    expect(first.episode?.id).toBe(s1.episodes[0]!.id);

    const crossSeason: PlaybackInfo = (
      await agent.post("/playback").send({ titleId: show.id, episodeId: lastOfS1.id, deviceId: DEVICE }).expect(200)
    ).body;
    expect(crossSeason.nextEpisodeId).toBe(show.seasons[1]!.episodes[0]!.id);

    await agent.post("/playback").send({ titleId: show.id, episodeId: "bogus", deviceId: DEVICE }).expect(404);
  });
});

describe("viewer state", () => {
  it("tracks progress, resumes, and builds continue watching", async () => {
    const { agent, title: movie } = await userWithTicket("tears-of-steel");
    const show = await getTitle("orbit-kitchen");
    const ep2 = show.seasons[0]!.episodes[1]!;

    await agent.put("/me/progress").send({ titleId: movie.id, positionSec: 120, durationSec: 734 }).expect(204);
    await agent.put("/me/progress").send({ titleId: show.id, episodeId: ep2.id, positionSec: 30, durationSec: 600 }).expect(204);
    await agent.put("/me/progress").send({ titleId: show.id, positionSec: 30, durationSec: 600 }).expect(400);

    const cw = (await agent.get("/me/continue-watching").expect(200)).body;
    expect(cw.map((i: { title: TitleSummary }) => i.title.slug)).toEqual(["orbit-kitchen", "tears-of-steel"]);
    expect(cw[0].episode.id).toBe(ep2.id);

    const resume: PlaybackInfo = (await agent.post("/playback").send({ titleId: movie.id, deviceId: DEVICE }).expect(200)).body;
    expect(resume.resumeFromSec).toBe(120);

    // Finishing the movie removes it from continue watching.
    await agent.put("/me/progress").send({ titleId: movie.id, positionSec: 730, durationSec: 734 }).expect(204);
    const after = (await agent.get("/me/continue-watching").expect(200)).body;
    expect(after.map((i: { title: TitleSummary }) => i.title.slug)).toEqual(["orbit-kitchen"]);
  });

  it("manages My List", async () => {
    const { agent } = await signUp();
    const movie = await getTitle("big-buck-bunny");

    await agent.put(`/me/list/${movie.id}`).expect(204);
    await agent.put(`/me/list/${movie.id}`).expect(204); // idempotent
    expect((await agent.get("/me/list").expect(200)).body).toHaveLength(1);
    expect((await agent.get("/catalog/titles/big-buck-bunny").expect(200)).body.inMyList).toBe(true);

    await agent.delete(`/me/list/${movie.id}`).expect(204);
    expect((await agent.get("/me/list").expect(200)).body).toHaveLength(0);
  });
});
