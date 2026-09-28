import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CinemaSchedule, HomeFeed, PlaybackInfo, Profile, SearchResponse, Suggestion, TitleDetail, TitleSummary } from "@ott/shared";
import { prisma } from "../src/lib/db.js";
import { invalidateRecommendations } from "../src/lib/recommend.js";
import { invalidateSearchIndex, normalize, similarity } from "../src/lib/search.js";
import { localDate } from "../src/routes/cinema.js";
import { DEVICE, app, buy, getTitle, signUp, uniq } from "./helpers.js";

type Agent = ReturnType<typeof request.agent>;

afterAll(() => prisma.$disconnect());
beforeEach(() => {
  invalidateRecommendations();
  invalidateSearchIndex();
});

const slugs = (titles: TitleSummary[]) => titles.map((t) => t.slug);
const hitSlugs = (res: SearchResponse) => res.results.map((r) => r.title.slug);
const home = async (agent: Agent | ReturnType<typeof request>): Promise<HomeFeed> =>
  (await (agent as Agent).get("/catalog/home").expect(200)).body;
const row = (feed: HomeFeed, kind: string) => feed.rows.find((r) => r.kind === kind);

async function kidsProfile(agent: Agent): Promise<Profile> {
  const kid: Profile = (await agent.post("/profiles").send({ name: "Kids", kids: true }).expect(201)).body;
  await agent.put("/profiles/current").send({ profileId: kid.id }).expect(200);
  return kid;
}

describe("profiles", () => {
  it("starts with one profile and switches between several", async () => {
    const { agent, me } = await signUp();
    expect(me.profiles).toHaveLength(1);
    expect(me.profile.name).toBe("Viewer");

    const dad: Profile = (await agent.post("/profiles").send({ name: "Dad" }).expect(201)).body;
    await agent.post("/profiles").send({ name: "Dad" }).expect(409);
    const switched: Profile = (await agent.put("/profiles/current").send({ profileId: dad.id }).expect(200)).body;
    expect(switched.name).toBe("Dad");
    expect((await agent.get("/auth/me").expect(200)).body.profile.id).toBe(dad.id);

    await agent.patch(`/profiles/${dad.id}`).send({ avatar: "gold" }).expect(200);
    for (const name of ["A", "B", "C"]) await agent.post("/profiles").send({ name }).expect(201);
    const sixth = await agent.post("/profiles").send({ name: "D" });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("too_many_profiles");
  });

  it("keeps My List and history separate per profile", async () => {
    const { agent, me } = await signUp();
    const movie = await getTitle("big-buck-bunny");
    await agent.put(`/me/list/${movie.id}`).expect(204);
    await agent.put("/me/progress").send({ titleId: movie.id, positionSec: 60, durationSec: 596 }).expect(204);

    const sis: Profile = (await agent.post("/profiles").send({ name: "Sis" }).expect(201)).body;
    await agent.put("/profiles/current").send({ profileId: sis.id }).expect(200);
    expect((await agent.get("/me/list").expect(200)).body).toHaveLength(0);
    expect((await agent.get("/me/continue-watching").expect(200)).body).toHaveLength(0);

    // A header works too (for native apps), and the original profile still has its data.
    const list = await agent.get("/me/list").set("x-profile-id", me.profile.id).expect(200);
    expect(slugs(list.body)).toEqual(["big-buck-bunny"]);
  });

  it("can't use or delete someone else's profile, nor the last one", async () => {
    const a = await signUp();
    const b = await signUp();
    await b.agent.put("/profiles/current").send({ profileId: a.me.profile.id }).expect(404);
    // A foreign id in the header is ignored rather than trusted.
    const me = await b.agent.get("/auth/me").set("x-profile-id", a.me.profile.id).expect(200);
    expect(me.body.profile.id).toBe(b.me.profile.id);
    const last = await a.agent.delete(`/profiles/${a.me.profile.id}`);
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe("last_profile");
  });

  it("shows kids profiles only family-friendly titles, everywhere", async () => {
    const { agent } = await signUp();
    const tears = await getTitle("tears-of-steel"); // PG-13
    await kidsProfile(agent);

    const feed = await home(agent);
    const everything = feed.rows.flatMap((r) => r.titles);
    expect(everything.length).toBeGreaterThan(0);
    expect(everything.every((t) => ["G", "PG", "TVY", "TVPG"].includes(t.maturity))).toBe(true);
    await agent.get("/catalog/titles/tears-of-steel").expect(404);
    await agent.get("/catalog/titles/big-buck-bunny").expect(200);
    const found: SearchResponse = (await agent.get("/search").query({ q: "tears of steel" }).expect(200)).body;
    expect(found.results).toHaveLength(0);

    // Even with a ticket on the account, the kids profile can't play it.
    await buy(agent, { titleId: tears.id });
    await agent.post("/playback").send({ titleId: tears.id, deviceId: DEVICE }).expect(404);
  });
});

describe("search", () => {
  it("normalizes Mizo diacritics and measures typos", () => {
    expect(normalize("Ṭhingpui Â-ê!")).toBe("thingpui a e");
    expect(similarity("steel", "steel")).toBe(1);
    expect(similarity("steal", "steel")).toBeGreaterThan(0.3);
    expect(similarity("steel", "bunny")).toBe(0);
  });

  const find = async (q: string): Promise<SearchResponse> => (await request(app).get("/search").query({ q }).expect(200)).body;

  it("finds titles despite typos, accents and partial words", async () => {
    expect(hitSlugs(await find("tears of steal"))[0]).toBe("tears-of-steel");
    expect(hitSlugs(await find("Ṭears"))[0]).toBe("tears-of-steel");
    expect(hitSlugs(await find("bun"))[0]).toBe("big-buck-bunny");
    // Alternative (Mizo) names are searchable.
    expect(hitSlugs(await find("hmun rei"))).toContain("the-long-harbor");
  });

  it("searches people and genres, and suggests a fix when nothing matches", async () => {
    const people = await find("ian hubert");
    expect(people.people[0]).toMatchObject({ name: "Ian Hubert", role: "director" });
    expect(slugs(people.people[0]!.titles)).toEqual(["tears-of-steel"]);
    expect(people.results[0]!.matched).toBe("people");

    const animation = hitSlugs(await find("animation"));
    expect(animation).toEqual(expect.arrayContaining(["sintel", "big-buck-bunny"]));

    const none = await find("long harbour castle");
    expect(none.results).toHaveLength(0);
    expect(none.didYouMean).toBe("The Long Harbor");
  });

  it("suggests titles and people while typing", async () => {
    const s: Suggestion[] = (await request(app).get("/search/suggest").query({ q: "sin" }).expect(200)).body;
    expect(s[0]).toEqual({ text: "Sintel", kind: "title", slug: "sintel" });
    const p: Suggestion[] = (await request(app).get("/search/suggest").query({ q: "hubert" }).expect(200)).body;
    expect(p).toContainEqual({ text: "Ian Hubert", kind: "person" });
    expect((await request(app).get("/search/suggest").query({ q: "" }).expect(200)).body).toEqual([]);
  });
});

describe("ratings & recommendations", () => {
  it("rates titles", async () => {
    const { agent } = await signUp();
    const bunny = await getTitle("big-buck-bunny");
    await agent.put(`/me/ratings/${bunny.id}`).send({ value: 3 }).expect(400);
    await agent.put(`/me/ratings/${bunny.id}`).send({ value: 2 }).expect(204);
    expect(((await agent.get("/catalog/titles/big-buck-bunny").expect(200)).body as TitleDetail).myRating).toBe(2);
    await agent.delete(`/me/ratings/${bunny.id}`).expect(204);
    expect(((await agent.get("/catalog/titles/big-buck-bunny").expect(200)).body as TitleDetail).myRating).toBeNull();
  });

  it("personalizes the home feed from what you watch and rate", async () => {
    const anon = await home(request(app) as unknown as Agent);
    expect(row(anon, "because")).toBeUndefined();
    expect(row(anon, "for_you")).toBeUndefined();
    expect(row(anon, "new")).toBeDefined();

    const { agent } = await signUp();
    const bunny = await getTitle("big-buck-bunny");
    await agent.put("/me/progress").send({ titleId: bunny.id, positionSec: 596, durationSec: 596 }).expect(204);
    await agent.put(`/me/ratings/${bunny.id}`).send({ value: 2 }).expect(204);

    const feed = await home(agent);
    const because = row(feed, "because")!;
    expect(because.label).toBe("Because you watched Big Buck Bunny");
    // The other animation is in; co-watching (other viewers' purchases) may rank others too.
    expect(slugs(because.titles)).toContain("sintel");
    expect(slugs(because.titles)).not.toContain("big-buck-bunny");
    const forYou = row(feed, "for_you")!;
    expect(slugs(forYou.titles)).not.toContain("big-buck-bunny"); // already watched
    expect(slugs(forYou.titles)).toContain("sintel");
    // Genre rows lead with what you love.
    expect(feed.rows.find((r) => r.kind === "genre")!.id).toMatch(/genre-(animation|comedy|family)/);

    // "Not for me" removes a title from recommendations.
    const sintel = await getTitle("sintel");
    await agent.put(`/me/ratings/${sintel.id}`).send({ value: -1 }).expect(204);
    const after = await home(agent);
    expect(slugs(row(after, "for_you")!.titles)).not.toContain("sintel");
  });

  it("finds similar titles by content and by what people watch together", async () => {
    const similar: TitleSummary[] = (await request(app).get("/catalog/titles/big-buck-bunny/similar").expect(200)).body;
    expect(slugs(similar)).toContain("sintel");
    expect(slugs(similar)).not.toContain("big-buck-bunny");

    const make = (slug: string, genres: string[] = []) =>
      prisma.title.create({
        data: {
          slug, type: "MOVIE", name: slug, synopsis: "x", year: 2026, maturity: "PG", language: `lang-${slug}`,
          posterUrl: "https://example.com/p.jpg", backdropUrl: "https://example.com/b.jpg",
          durationSec: 600, manifestUrl: "https://cdn.example.com/x.m3u8",
          genres: { connect: genres.map((slug) => ({ slug })) },
        },
      });

    // With no sales at all, a shared genre and director beats an unrelated title.
    const base = await make(`sim-base-${uniq()}`, ["animation", "family"]);
    const kin = await make(`sim-kin-${uniq()}`, ["animation", "family"]);
    const stranger = await make(`sim-far-${uniq()}`, ["documentary"]);
    invalidateRecommendations();
    const sims = slugs((await request(app).get(`/catalog/titles/${base.slug}/similar`).expect(200)).body);
    expect(sims.indexOf(kin.slug)).toBeGreaterThanOrEqual(0);
    if (sims.includes(stranger.slug)) expect(sims.indexOf(kin.slug)).toBeLessThan(sims.indexOf(stranger.slug));

    // Two titles with nothing in common on paper, bought by the same people.
    const a = await make(`co-a-${uniq()}`);
    const b = await make(`co-b-${uniq()}`);
    for (let i = 0; i < 3; i++) {
      const { agent } = await signUp();
      await buy(agent, { titleId: a.id });
      await buy(agent, { titleId: b.id });
    }
    invalidateRecommendations();
    const co: TitleSummary[] = (await request(app).get(`/catalog/titles/${a.slug}/similar`).expect(200)).body;
    expect(slugs(co)[0]).toBe(b.slug);
  });

  it("ranks a Top 10 once tickets sell", async () => {
    const { agent } = await signUp();
    const tears = await getTitle("tears-of-steel");
    await buy(agent, { titleId: tears.id, quantity: 3 });
    const top = row(await home(agent), "top10")!;
    expect(top.ranked).toBe(true);
    expect(top.titles.length).toBeGreaterThan(0);
    expect(top.titles.length).toBeLessThanOrEqual(10);
  });

  it("keeps a watch history", async () => {
    const { agent } = await signUp();
    const bunny = await getTitle("big-buck-bunny");
    const tears = await getTitle("tears-of-steel");
    await agent.put("/me/progress").send({ titleId: bunny.id, positionSec: 596, durationSec: 596 }).expect(204);
    await agent.put("/me/progress").send({ titleId: tears.id, positionSec: 30, durationSec: 734 }).expect(204);
    const history = (await agent.get("/me/history").expect(200)).body as { title: TitleSummary; completed: boolean }[];
    expect(history.map((h) => [h.title.slug, h.completed])).toEqual([["tears-of-steel", false], ["big-buck-bunny", true]]);
  });
});

describe("player markers", () => {
  it("returns skip-intro and credits timings", async () => {
    const { agent } = await signUp();
    const bunny = await getTitle("big-buck-bunny");
    await buy(agent, { titleId: bunny.id });
    const info: PlaybackInfo = (await agent.post("/playback").send({ titleId: bunny.id, deviceId: DEVICE }).expect(200)).body;
    expect(info.markers).toEqual({ introStartSec: 0, introEndSec: 25, creditsStartSec: 575 });
  });
});

describe("our cinema", () => {
  it("uses the cinema's local date", () => {
    expect(localDate(new Date("2026-09-28T20:00:00Z"), "Asia/Kolkata")).toBe("2026-09-29");
    expect(localDate(new Date("2026-09-28T17:00:00Z"), "Asia/Kolkata")).toBe("2026-09-28");
  });

  it("lists the week's showtimes with BookMyShow links per day", async () => {
    const s: CinemaSchedule = (await request(app).get("/cinema/remphamly-aizawl").expect(200)).body;
    expect(s.cinema.name).toBe("RemPhamLy Cinema");
    expect(s.days).toHaveLength(7);
    expect(s.days[0]!.date).toBe(localDate(new Date(), "Asia/Kolkata"));
    const d = s.days[1]!;
    expect(d.bookingUrl).toBe(
      `https://in.bookmyshow.com/cinemas/aizawl/remphamly-cinema-aizawl/buytickets/RHCA/${d.date.replaceAll("-", "")}`,
    );
    const linked = s.days.flatMap((x) => x.showtimes).find((x) => x.title?.slug === "sintel");
    expect(linked).toBeDefined();
    await request(app).get("/cinema/nowhere").expect(404);
  });

  it("lets staff add and remove showtimes", async () => {
    const viewer = await signUp();
    const show = { cinemaSlug: "remphamly-aizawl", filmName: `Zawlbuk ${uniq()}`, language: "Mizo", startsAt: new Date(Date.now() + 26 * 3600_000).toISOString() };
    await viewer.agent.post("/admin/showtimes").send(show).expect(403);

    const staff = await signUp();
    await prisma.user.update({ where: { email: staff.email }, data: { role: "ADMIN" } });
    const [created] = (await staff.agent.post("/admin/showtimes").send([show]).expect(201)).body as { id: string }[];
    await staff.agent.post("/admin/showtimes").send({ ...show, cinemaSlug: "nope" }).expect(404);

    const s: CinemaSchedule = (await request(app).get("/cinema/remphamly-aizawl").expect(200)).body;
    const day = s.days.find((x) => x.showtimes.some((st) => st.id === created!.id))!;
    expect(day.date).toBe(localDate(new Date(show.startsAt), "Asia/Kolkata"));
    expect(day.showtimes.find((st) => st.id === created!.id)).toMatchObject({ filmName: show.filmName, language: "Mizo", title: null });

    await staff.agent.delete(`/admin/showtimes/${created!.id}`).expect(204);
    await staff.agent.delete(`/admin/showtimes/${created!.id}`).expect(404);
  });
});
