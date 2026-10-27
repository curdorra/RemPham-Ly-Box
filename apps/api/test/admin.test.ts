import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import type { AdminKitchen, AdminScreening, AdminTitle, AdminTitleRow, SnackItem, TitleInput } from "@ott/shared";
import { prisma } from "../src/lib/db.js";
import { publishDueTitles } from "../src/lib/publishing.js";
import { app, buy, signUp, uniq } from "./helpers.js";

afterAll(() => prisma.$disconnect());

async function staff() {
  const user = await signUp();
  await prisma.user.update({ where: { email: user.email }, data: { role: "ADMIN" } });
  return user.agent;
}

const movieInput = (over: Partial<TitleInput> = {}): TitleInput => ({
  slug: `admin-film-${uniq()}`,
  type: "MOVIE",
  name: "Thlarau Thianghlim",
  synopsis: "A test film.",
  year: 2026,
  maturity: "PG",
  posterUrl: "https://example.com/p.jpg",
  backdropUrl: "https://example.com/b.jpg",
  genres: ["Drama", "Family Time"],
  cast: ["Lalremruata"],
  durationSec: 5400,
  manifestUrl: "https://cdn.example.com/film/master.m3u8",
  pricePaise: 9900,
  rentalHours: 48,
  ...over,
});

describe("staff only", () => {
  it("refuses viewers and anonymous visitors", async () => {
    await request(app).get("/admin/titles").expect(401);
    const { agent } = await signUp();
    await agent.get("/admin/titles").expect(403);
    await agent.post("/admin/titles").send(movieInput()).expect(403);
  });
});

describe("titles", () => {
  it("creates a draft, publishes it, and it appears in the catalog", async () => {
    const admin = await staff();
    const input = movieInput();
    const created: AdminTitle = (await admin.post("/admin/titles").send(input).expect(201)).body;
    expect(created.published).toBe(false);
    expect(created.genres).toEqual(["Drama", "Family Time"]);
    expect(await prisma.genre.findUnique({ where: { slug: "family-time" } })).not.toBeNull();

    // Drafts are invisible to viewers.
    await request(app).get(`/catalog/titles/${input.slug}`).expect(404);
    const list: AdminTitleRow[] = (await admin.get("/admin/titles").expect(200)).body;
    expect(list.find((t) => t.id === created.id)).toMatchObject({ published: false, hasVideo: true, ticketsSold: 0 });

    const updated: AdminTitle = (
      await admin.patch(`/admin/titles/${created.id}`).send({ published: true, pricePaise: 12900, genres: ["Drama"] }).expect(200)
    ).body;
    expect(updated).toMatchObject({ published: true, pricePaise: 12900, genres: ["Drama"] });
    const pub = (await request(app).get(`/catalog/titles/${input.slug}`).expect(200)).body;
    expect(pub.pricePaise).toBe(12900);
  });

  it("leaves fields that an edit doesn't mention alone", async () => {
    const admin = await staff();
    const t: AdminTitle = (await admin.post("/admin/titles").send(movieInput({ published: true, featured: true })).expect(201)).body;
    const after: AdminTitle = (await admin.patch(`/admin/titles/${t.id}`).send({ pricePaise: 5000 }).expect(200)).body;
    expect(after).toMatchObject({ pricePaise: 5000, published: true, featured: true, genres: t.genres, cast: t.cast });
  });

  it("rejects a duplicate slug", async () => {
    const admin = await staff();
    const input = movieInput();
    await admin.post("/admin/titles").send(input).expect(201);
    const res = await admin.post("/admin/titles").send(input).expect(409);
    expect(res.body.error.code).toBe("duplicate");
  });

  it("publishes scheduled drafts when their time comes", async () => {
    const admin = await staff();
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const t: AdminTitle = (await admin.post("/admin/titles").send(movieInput({ publishAt: soon })).expect(201)).body;
    expect(t).toMatchObject({ published: false, publishAt: soon });

    await publishDueTitles(new Date());
    expect((await prisma.title.findUniqueOrThrow({ where: { id: t.id } })).published).toBe(false);

    await publishDueTitles(new Date(Date.now() + 2 * 3600_000));
    const after = await prisma.title.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ published: true, publishAt: null });
  });

  it("only deletes titles nobody has tickets for", async () => {
    const admin = await staff();
    const t: AdminTitle = (await admin.post("/admin/titles").send(movieInput({ published: true })).expect(201)).body;
    const { agent } = await signUp();
    await buy(agent, { titleId: t.id });
    expect((await admin.get(`/admin/titles/${t.id}`).expect(200)).body.ticketsSold).toBe(1);
    expect((await admin.delete(`/admin/titles/${t.id}`).expect(409)).body.error.code).toBe("has_tickets");

    const draft: AdminTitle = (await admin.post("/admin/titles").send(movieInput()).expect(201)).body;
    await admin.delete(`/admin/titles/${draft.id}`).expect(204);
    await admin.get(`/admin/titles/${draft.id}`).expect(404);
  });

  it("manages seasons and episodes of a series", async () => {
    const admin = await staff();
    const series: AdminTitle = (
      await admin.post("/admin/titles").send(movieInput({ type: "SERIES", durationSec: null, manifestUrl: null, published: true })).expect(201)
    ).body;
    let t: AdminTitle = (await admin.post(`/admin/titles/${series.id}/seasons`).send({ number: 1, name: "Season 1" }).expect(201)).body;
    const seasonId = t.seasons[0]!.id;
    const episode = {
      number: 1,
      name: "Pilot",
      durationSec: 1500,
      thumbnailUrl: "https://example.com/e1.jpg",
      manifestUrl: "https://cdn.example.com/e1/master.m3u8",
    };
    t = (await admin.post(`/admin/seasons/${seasonId}/episodes`).send(episode).expect(201)).body;
    expect(t.seasons[0]!.episodes.map((e) => e.name)).toEqual(["Pilot"]);
    await admin.post(`/admin/seasons/${seasonId}/episodes`).send(episode).expect(409);

    const epId = t.seasons[0]!.episodes[0]!.id;
    t = (await admin.patch(`/admin/episodes/${epId}`).send({ name: "Bul Tanna" }).expect(200)).body;
    expect(t.seasons[0]!.episodes[0]!.name).toBe("Bul Tanna");
    const detail = (await request(app).get(`/catalog/titles/${series.slug}`).expect(200)).body;
    expect(detail.seasons[0].episodes[0].name).toBe("Bul Tanna");

    t = (await admin.delete(`/admin/episodes/${epId}`).expect(200)).body;
    expect(t.seasons[0]!.episodes).toEqual([]);
    t = (await admin.delete(`/admin/seasons/${seasonId}`).expect(200)).body;
    expect(t.seasons).toEqual([]);
  });
});

describe("opening nights", () => {
  it("creates, reprices and protects sold-out seat maps", async () => {
    const admin = await staff();
    const film: AdminTitle = (await admin.post("/admin/titles").send(movieInput({ published: true })).expect(201)).body;
    const startsAt = new Date(Date.now() + 3 * 86400_000).toISOString();

    await admin.post("/admin/screenings").send({ titleId: film.id, startsAt, seatsPerRow: 6, aisleAfter: [6] }).expect(400);
    const s: AdminScreening = (
      await admin.post("/admin/screenings").send({ titleId: film.id, startsAt, rows: 4, seatsPerRow: 6, aisleAfter: [3] }).expect(201)
    ).body;
    expect(s).toMatchObject({ capacity: 24, seatsSold: 0, hasTickets: false, pricePaise: null, state: "UPCOMING" });

    const { agent } = await signUp();
    await buy(agent, { titleId: film.id, screeningId: s.id });

    const repriced: AdminScreening = (await admin.patch(`/admin/screenings/${s.id}`).send({ pricePaise: 14900 }).expect(200)).body;
    expect(repriced).toMatchObject({ pricePaise: 14900, seatsSold: 1, hasTickets: true });
    await admin.patch(`/admin/screenings/${s.id}`).send({ rows: 2 }).expect(409);
    await admin.delete(`/admin/screenings/${s.id}`).expect(409);

    const list: AdminScreening[] = (await admin.get("/admin/screenings").expect(200)).body;
    expect(list.some((x) => x.id === s.id)).toBe(true);
  });
});

describe("kitchens", () => {
  it("adds a kitchen and menu items that show on the public menu", async () => {
    const admin = await staff();
    const k: AdminKitchen = (await admin.post("/admin/kitchens").send({ name: `Kitchen ${uniq()}`, phone: "+91 98765 43210" }).expect(201)).body;
    let withItems: AdminKitchen = (
      await admin.post(`/admin/kitchens/${k.id}/items`).send({ name: "Bai Special", description: "Pork and greens", pricePaise: 15000 }).expect(201)
    ).body;
    withItems = (await admin.post(`/admin/kitchens/${k.id}/items`).send({ name: "Bai Special", pricePaise: 16000 }).expect(201)).body;
    expect(withItems.items.map((i) => i.slug).sort()).toEqual(["bai-special", "bai-special-2"]);

    let menu: SnackItem[] = (await request(app).get("/snacks").expect(200)).body;
    expect(menu.filter((i) => i.kitchen.id === k.id)).toHaveLength(2);

    const item = withItems.items[0]!;
    await admin.patch(`/admin/snack-items/${item.id}`).send({ available: false }).expect(200);
    await admin.patch(`/admin/kitchens/${k.id}`).send({ active: false }).expect(200);
    menu = (await request(app).get("/snacks").expect(200)).body;
    expect(menu.filter((i) => i.kitchen.id === k.id)).toHaveLength(0);

    await admin.delete(`/admin/snack-items/${item.id}`).expect(200);
    await admin.delete(`/admin/kitchens/${k.id}`).expect(204);
  });
});

describe("uploads", () => {
  it("stores an image and serves it back", async () => {
    const admin = await staff();
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
    const res = await admin.post("/admin/uploads?kind=poster").set("content-type", "image/png").send(png).expect(201);
    expect(res.body.url).toMatch(/^\/api\/uploads\/artwork\/poster\/.+\.png$/);
    const served = await request(app).get(res.body.url.replace(/^\/api/, "")).expect(200);
    expect(served.headers["content-type"]).toBe("image/png");

    await admin.post("/admin/uploads?kind=poster").set("content-type", "text/plain").send("hello").expect(415);
  });
});
