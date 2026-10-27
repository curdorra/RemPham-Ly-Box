import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import type { AdminStats, SnackItem, Ticket } from "@ott/shared";
import { prisma } from "../src/lib/db.js";
import { statsWindow } from "../src/lib/stats.js";
import { DEVICE, app, buy, signUp, uniq } from "./helpers.js";

afterAll(() => prisma.$disconnect());

async function staff() {
  const user = await signUp();
  await prisma.user.update({ where: { email: user.email }, data: { role: "ADMIN" } });
  return user.agent;
}

const freshMovie = () => {
  const slug = `stats-movie-${uniq()}`;
  return prisma.title.create({
    data: {
      slug, type: "MOVIE", name: `Stats ${slug}`, synopsis: "x", year: 2026, maturity: "PG",
      posterUrl: "https://example.com/p.jpg", backdropUrl: "https://example.com/b.jpg",
      durationSec: 1000, manifestUrl: "https://cdn.example.com/test/master.m3u8", pricePaise: 10000, published: true,
    },
  });
};

describe("stats window", () => {
  it("runs custom days midnight to midnight India time, or the last N days", () => {
    const w = statsWindow({ from: "2026-10-01", to: "2026-10-02" });
    expect(w.from.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(w.to.toISOString()).toBe("2026-10-02T18:29:59.999Z");
    const now = new Date("2026-10-27T00:00:00Z");
    expect(statsWindow({ days: 7 }, now).from.toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("GET /admin/stats", () => {
  it("is staff only", async () => {
    await request(app).get("/admin/stats").expect(401);
    const { agent } = await signUp();
    await agent.get("/admin/stats").expect(403);
  });

  it("rejects bad ranges", async () => {
    const admin = await staff();
    await admin.get("/admin/stats?from=2026-10-01").expect(400);
    await admin.get("/admin/stats?from=2026-10-05&to=2026-10-01").expect(400);
    await admin.get("/admin/stats?days=0").expect(400);
    await admin.get("/admin/stats?days=7").expect(200);
  });

  it("adds up money, audience, watching, opening nights and ratings", async () => {
    const admin = await staff();
    const get = async (): Promise<AdminStats> => (await admin.get("/admin/stats?days=7").expect(200)).body;
    const before = await get();

    const movie = await freshMovie();
    const buyer = await signUp();
    await buy(buyer.agent, { titleId: movie.id, quantity: 3 }); // 2 of the 3 become gift codes
    await buy(buyer.agent, { titleId: movie.id, tier: "TOGETHER" });
    const gifts = ((await buyer.agent.get("/tickets").expect(200)).body as Ticket[]).filter((t) => t.isGiftForOthers);
    const friend = await signUp();
    await friend.agent.post("/tickets/redeem").send({ code: gifts[0]!.giftCode }).expect(200);

    const menu: SnackItem[] = (await request(app).get("/snacks").expect(200)).body;
    const snack = menu[0]!;
    await buy(buyer.agent, { snacks: [{ itemId: snack.id, qty: 2 }], delivery: { address: "12 Main Road, Aizawl", phone: "+91 98765 43210" } });

    // Watching: one finished viewer, one halfway; one live session; one rating.
    const progress = (agent: typeof friend.agent, positionSec: number) =>
      agent.put("/me/progress").send({ titleId: movie.id, positionSec, durationSec: 1000 }).expect(204);
    await progress(buyer.agent, 1000);
    await progress(friend.agent, 500);
    await buyer.agent.post("/playback").send({ titleId: movie.id, deviceId: DEVICE }).expect(200);
    await buyer.agent.put(`/me/ratings/${movie.id}`).send({ value: 2 }).expect(204);
    await friend.agent.put(`/me/ratings/${movie.id}`).send({ value: -1 }).expect(204);

    // An opening night with one seat sold and that viewer joined.
    const screening = await prisma.screening.create({
      data: { titleId: movie.id, startsAt: new Date(Date.now() + 86400_000), rows: 2, seatsPerRow: 5, aisleAfter: [] },
    });
    const goer = await signUp();
    const seat = await buy(goer.agent, { titleId: movie.id, screeningId: screening.id, seats: ["A1"] });
    // Joining before the doors open is refused by /playback, so record the live session directly.
    await prisma.playbackSession.create({ data: { ticketId: seat.tickets[0]!.id, deviceId: "goer-device" } });

    const after = await get();
    const row = after.money.byTitle.find((t) => t.titleId === movie.id)!;
    expect(row.tickets).toBe(5); // 3 + 1 + the seat
    expect(row.grossPaise).toBe(3 * 10000 + (10000 + 6000) + 10000);

    expect(after.money.tickets - before.money.tickets).toBe(5);
    expect(after.money.grossPaise - before.money.grossPaise).toBe(row.grossPaise);
    const tier = (s: AdminStats, t: string) => s.money.byTier.find((x) => x.tier === t)?.tickets ?? 0;
    expect(tier(after, "TOGETHER") - tier(before, "TOGETHER")).toBe(1);
    expect(after.money.snackPaise - before.money.snackPaise).toBe(snack.pricePaise * 2);
    expect(after.money.snackOrders - before.money.snackOrders).toBe(1);
    expect(after.money.giftsIssued - before.money.giftsIssued).toBe(2);
    expect(after.money.giftsRedeemed - before.money.giftsRedeemed).toBe(1);
    expect(after.money.byDay).toHaveLength(8);
    expect(after.money.byDay.reduce((s, d) => s + d.tickets, 0)).toBe(after.money.tickets);

    expect(after.audience.signUps - before.audience.signUps).toBe(3); // buyer, friend, goer
    expect(after.audience.buyers - before.audience.buyers).toBeGreaterThanOrEqual(2);
    expect(after.audience.repeatBuyers - before.audience.repeatBuyers).toBeGreaterThanOrEqual(1);

    const watch = after.watching.byTitle.find((t) => t.titleId === movie.id)!;
    expect(watch.viewers).toBe(2);
    expect(watch.avgWatchSec).toBe(750);
    expect(watch.completionRate).toBe(0.5);
    expect(watch.dropOff).toHaveLength(10);
    expect(watch.dropOff[4]).toBe(1); // both reached 50%
    expect(watch.dropOff[5]).toBe(0.5); // only the finisher got past 50%
    expect(watch.dropOff[9]).toBe(0.5);
    expect(after.watching.viewersNow - before.watching.viewersNow).toBe(2); // the buyer's and the goer's

    const night = after.openingNights.find((s) => s.id === screening.id)!;
    expect(night).toMatchObject({ sold: 1, capacity: 10, joinedNow: 1, titleId: movie.id });

    expect(after.ratings.find((r) => r.titleId === movie.id)).toMatchObject({ loved: 1, liked: 0, disliked: 1, count: 2, approval: 0.5 });
  });
});
