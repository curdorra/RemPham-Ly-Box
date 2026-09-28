import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { BoxOffice, Order, PlaybackInfo, ScreeningDetail, ScreeningSummary, SnackItem, Ticket } from "@ott/shared";
import { prisma } from "../src/lib/db.js";
import { DEVICE, app, buy, getTitle, signUp, uniq, userWithTicket } from "./helpers.js";

const HOUR = 3600_000;

/** A throwaway movie so screening tests don't interfere with each other. */
async function freshMovie(opts: { durationSec?: number; pricePaise?: number } = {}) {
  const slug = `test-movie-${uniq()}`;
  return prisma.title.create({
    data: {
      slug,
      type: "MOVIE",
      name: `Test Movie ${slug}`,
      synopsis: "Test",
      year: 2026,
      maturity: "PG",
      posterUrl: "https://example.com/p.jpg",
      backdropUrl: "https://example.com/b.jpg",
      durationSec: opts.durationSec ?? 3600,
      manifestUrl: "https://cdn.example.com/test/master.m3u8",
      pricePaise: opts.pricePaise ?? 9900,
    },
  });
}

async function screeningFor(titleId: string, startsAt: Date) {
  return prisma.screening.create({ data: { titleId, startsAt, rows: 4, seatsPerRow: 6, aisleAfter: [3] } });
}

const play = (agent: ReturnType<typeof request.agent>, titleId: string, deviceId = DEVICE) =>
  agent.post("/playback").send({ titleId, deviceId });

afterAll(() => prisma.$disconnect());

describe("orders & dev payments", () => {
  it("creates a pending order, then pays it", async () => {
    const { agent } = await signUp();
    const movie = await getTitle("big-buck-bunny");
    const created = await agent.post("/orders").send({ titleId: movie.id }).expect(201);
    const order: Order = created.body;
    expect(order.status).toBe("PENDING");
    expect(order.amountPaise).toBe(movie.pricePaise);
    expect(order.checkout).toEqual({ provider: "dev" });

    // Nothing is watchable until payment.
    await play(agent, movie.id).expect(402);
    expect((await agent.get("/tickets").expect(200)).body).toHaveLength(0);

    const paid: Order = (await agent.post(`/orders/${order.id}/confirm-dev`).expect(200)).body;
    expect(paid.status).toBe("PAID");
    expect(paid.checkout).toBeNull();
    const tickets: Ticket[] = (await agent.get("/tickets").expect(200)).body;
    expect(tickets.map((t) => [t.title.slug, t.state])).toEqual([["big-buck-bunny", "READY"]]);

    const history: Order[] = (await agent.get("/orders").expect(200)).body;
    expect(history.map((o) => o.id)).toEqual([order.id]);
  });

  it("keeps orders private", async () => {
    const { order } = await userWithTicket("signal-test");
    const stranger = await signUp();
    await stranger.agent.get(`/orders/${order.id}`).expect(404);
    await stranger.agent.post(`/orders/${order.id}/confirm-dev`).expect(404);
  });

  it("prices the watch-together tier and validates orders", async () => {
    const { agent } = await signUp();
    const movie = await getTitle("tears-of-steel");
    const order: Order = (await agent.post("/orders").send({ titleId: movie.id, tier: "TOGETHER", quantity: 2 }).expect(201)).body;
    expect(order.amountPaise).toBe((movie.pricePaise + 6000) * 2);
    expect(order.tickets[0]!.screens).toBe(3);

    const empty = await agent.post("/orders").send({});
    expect(empty.status).toBe(400);
    const snacksNoAddress = await agent.post("/orders").send({ snacks: [{ itemId: "x", qty: 1 }] });
    expect(snacksNoAddress.status).toBe(400);
    const seatsWithoutScreening = await agent.post("/orders").send({ titleId: movie.id, seats: ["A1"] });
    expect(seatsWithoutScreening.status).toBe(400);
  });
});

describe("gifting extra tickets", () => {
  it("turns extras into gift codes someone else can redeem once", async () => {
    const buyer = await signUp();
    const movie = await getTitle("tears-of-steel");
    await buy(buyer.agent, { titleId: movie.id, quantity: 3 });

    const mine: Ticket[] = (await buyer.agent.get("/tickets").expect(200)).body;
    const gifts = mine.filter((t) => t.isGiftForOthers);
    expect(mine).toHaveLength(3);
    expect(gifts).toHaveLength(2);
    expect(gifts.every((g) => /^RLB-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(g.giftCode!))).toBe(true);
    expect(mine.find((t) => !t.isGiftForOthers)!.giftCode).toBeNull();

    const friend = await signUp();
    await play(friend.agent, movie.id).expect(402);
    const redeemed = await friend.agent.post("/tickets/redeem").send({ code: gifts[0]!.giftCode!.toLowerCase() }).expect(200);
    expect(redeemed.body.isGiftForOthers).toBe(false);
    await play(friend.agent, movie.id).expect(200);

    const other = await signUp();
    const again = await other.agent.post("/tickets/redeem").send({ code: gifts[0]!.giftCode });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("gift_redeemed");
    await other.agent.post("/tickets/redeem").send({ code: "RLB-ZZZZ-ZZZZ" }).expect(404);

    // The buyer now sees one gift left.
    const after: Ticket[] = (await buyer.agent.get("/tickets").expect(200)).body;
    expect(after.filter((t) => t.isGiftForOthers)).toHaveLength(1);
  });
});

describe("rental window", () => {
  it("starts on first play and lasts rentalHours (+24h for watch together)", async () => {
    const standard = await userWithTicket("big-buck-bunny");
    const before = Date.now();
    const first: PlaybackInfo = (await play(standard.agent, standard.title.id).expect(200)).body;
    const expires = new Date(first.ticket.expiresAt!).getTime();
    expect(expires - before).toBeGreaterThanOrEqual(48 * HOUR - 5000);
    expect(expires - before).toBeLessThanOrEqual(48 * HOUR + 5000);

    // Playing again doesn't restart the clock.
    const second: PlaybackInfo = (await play(standard.agent, standard.title.id).expect(200)).body;
    expect(second.ticket.expiresAt).toBe(first.ticket.expiresAt);
    const [t] = (await standard.agent.get("/tickets").expect(200)).body as Ticket[];
    expect(t!.state).toBe("ACTIVE");

    const together = await userWithTicket("big-buck-bunny", "TOGETHER");
    const tg: PlaybackInfo = (await play(together.agent, together.title.id).expect(200)).body;
    expect(new Date(tg.ticket.expiresAt!).getTime() - Date.now()).toBeGreaterThan(71 * HOUR);
  });

  it("stops playback once the window has passed", async () => {
    const { agent, title, ticket } = await userWithTicket("signal-test");
    await play(agent, title.id).expect(200);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await play(agent, title.id);
    expect(res.status).toBe(402);
    expect(res.body.error.message).toMatch(/expired/);
    const [t] = (await agent.get("/tickets").expect(200)).body as Ticket[];
    expect(t!.state).toBe("EXPIRED");
    await agent.post("/playback/heartbeat").send({ ticketId: ticket.id, deviceId: DEVICE }).expect(402);
  });
});

describe("screen limits", () => {
  it("allows one screen on a standard ticket", async () => {
    const { agent, title, ticket } = await userWithTicket("tears-of-steel");
    await play(agent, title.id, "device-phone-1").expect(200);
    const second = await play(agent, title.id, "device-tv-0001");
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("too_many_screens");

    // Same device again is fine (e.g. a page reload).
    await play(agent, title.id, "device-phone-1").expect(200);

    // Closing the player frees the screen.
    await agent.post("/playback/release").send({ ticketId: ticket.id, deviceId: "device-phone-1" }).expect(204);
    await play(agent, title.id, "device-tv-0001").expect(200);

    // A device that stops sending heartbeats stops counting.
    await prisma.playbackSession.updateMany({ where: { ticketId: ticket.id }, data: { lastSeenAt: new Date(Date.now() - 5 * 60_000) } });
    await play(agent, title.id, "device-laptop-1").expect(200);
    await agent.post("/playback/heartbeat").send({ ticketId: ticket.id, deviceId: "device-laptop-1" }).expect(200);
    await agent.post("/playback/heartbeat").send({ ticketId: ticket.id, deviceId: "device-tv-0001" }).expect(409);
  });

  it("allows three screens when watching together", async () => {
    const { agent, title } = await userWithTicket("tears-of-steel", "TOGETHER");
    for (const d of ["device-mum-0001", "device-dad-0001", "device-kid-0001"]) await play(agent, title.id, d).expect(200);
    await play(agent, title.id, "device-extra-001").expect(409);
  });
});

describe("opening nights", () => {
  it("sells only opening-night seats before the premiere, with a seat map", async () => {
    const movie = await freshMovie();
    const screening = await screeningFor(movie.id, new Date(Date.now() + 48 * HOUR));
    const { agent } = await signUp();

    const onDemand = await agent.post("/orders").send({ titleId: movie.id });
    expect(onDemand.status).toBe(409);
    expect(onDemand.body.error.code).toBe("opening_night_only");

    const list: ScreeningSummary[] = (await agent.get("/screenings").expect(200)).body;
    const mine = list.find((s) => s.id === screening.id)!;
    expect(mine.state).toBe("UPCOMING");
    expect(mine.capacity).toBe(24);

    const order = await buy(agent, { titleId: movie.id, screeningId: screening.id, quantity: 2, seats: ["B2", "B3"] });
    expect(order.tickets.map((t) => t.seat)).toEqual(["B2", "B3"]);
    expect(order.tickets[0]!.state).toBe("UPCOMING");

    const detail: ScreeningDetail = (await agent.get(`/screenings/${screening.id}`).expect(200)).body;
    expect(detail.layout).toEqual({ rows: ["A", "B", "C", "D"], seatsPerRow: 6, aisleAfter: [3] });
    expect(detail.takenSeats).toEqual(["B2", "B3"]);
    // The second seat is a gift ticket, so only one is "mine" as a holder.
    expect(detail.mySeats).toEqual(["B2"]);

    const rival = await signUp();
    const clash = await rival.agent.post("/orders").send({ titleId: movie.id, screeningId: screening.id, seats: ["B3"] });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("seat_taken");
    const nowhere = await rival.agent.post("/orders").send({ titleId: movie.id, screeningId: screening.id, seats: ["Z9"] });
    expect(nowhere.status).toBe(400);

    // Without chosen seats the best free ones are assigned.
    const auto = await buy(rival.agent, { titleId: movie.id, screeningId: screening.id });
    expect(auto.tickets[0]!.seat).toMatch(/^[A-D][1-6]$/);
    expect(["B2", "B3"]).not.toContain(auto.tickets[0]!.seat);

    const early = await play(agent, movie.id);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("premiere_not_started");
    expect(early.body.error.details.startsAt).toBe(screening.startsAt.toISOString());
  });

  it("holds seats while paying and releases them when the hold expires", async () => {
    const movie = await freshMovie();
    const screening = await screeningFor(movie.id, new Date(Date.now() + 24 * HOUR));
    const slow = await signUp();
    const pending: Order = (await slow.agent.post("/orders").send({ titleId: movie.id, screeningId: screening.id, seats: ["A1"] }).expect(201)).body;

    const fast = await signUp();
    await fast.agent.post("/orders").send({ titleId: movie.id, screeningId: screening.id, seats: ["A1"] }).expect(409);

    await prisma.order.update({ where: { id: pending.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const took = await buy(fast.agent, { titleId: movie.id, screeningId: screening.id, seats: ["A1"] });
    expect(took.tickets[0]!.seat).toBe("A1");
    expect((await slow.agent.get(`/orders/${pending.id}`).expect(200)).body.status).toBe("EXPIRED");

    // The slow payment still lands (e.g. via webhook): valid ticket, another seat.
    await slow.agent.post(`/orders/${pending.id}/confirm-dev`).expect(200);
    const [t] = (await slow.agent.get("/tickets").expect(200)).body as Ticket[];
    expect(t!.seat).toMatch(/^[A-D][1-6]$/);
    expect(t!.seat).not.toBe("A1");
  });

  it("plays in sync while live, then works on demand without having used the window", async () => {
    const movie = await freshMovie({ durationSec: 3600 });
    const screening = await screeningFor(movie.id, new Date(Date.now() - 2 * 60_000));
    const { agent } = await signUp();
    const order = await buy(agent, { titleId: movie.id, screeningId: screening.id });
    expect(order.tickets[0]!.state).toBe("LIVE");

    const live: PlaybackInfo = (await play(agent, movie.id).expect(200)).body;
    expect(live.live?.screeningId).toBe(screening.id);
    expect(live.live!.offsetSec).toBeGreaterThanOrEqual(119);
    expect(live.live!.offsetSec).toBeLessThan(130);
    expect(live.resumeFromSec).toBe(live.live!.offsetSec);
    expect(live.ticket.expiresAt).toBeNull();

    // Move the screening into the past: the ticket becomes a normal one.
    await prisma.screening.update({ where: { id: screening.id }, data: { startsAt: new Date(Date.now() - 5 * HOUR) } });
    const [t] = (await agent.get("/tickets").expect(200)).body as Ticket[];
    expect(t!.state).toBe("READY");
    const later: PlaybackInfo = (await play(agent, movie.id).expect(200)).body;
    expect(later.live).toBeNull();
    expect(later.ticket.expiresAt).not.toBeNull();

    // After premiering, the title is sold on demand too.
    const newcomer = await signUp();
    await buy(newcomer.agent, { titleId: movie.id });
  });

  it("remembers reminders", async () => {
    const movie = await freshMovie();
    const screening = await screeningFor(movie.id, new Date(Date.now() + 72 * HOUR));
    const { agent } = await signUp();
    await request(app).put(`/screenings/${screening.id}/reminder`).expect(401);
    await agent.put(`/screenings/${screening.id}/reminder`).expect(204);
    await agent.put(`/screenings/${screening.id}/reminder`).expect(204);
    expect((await agent.get(`/screenings/${screening.id}`).expect(200)).body.reminded).toBe(true);
    await agent.delete(`/screenings/${screening.id}/reminder`).expect(204);
    expect((await agent.get(`/screenings/${screening.id}`).expect(200)).body.reminded).toBe(false);
  });

  it("closes sales once the screening has ended", async () => {
    const movie = await freshMovie({ durationSec: 600 });
    const screening = await screeningFor(movie.id, new Date(Date.now() - 3 * HOUR));
    const { agent } = await signUp();
    const res = await agent.post("/orders").send({ titleId: movie.id, screeningId: screening.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("screening_ended");
    const list: ScreeningSummary[] = (await request(app).get("/screenings").expect(200)).body;
    expect(list.some((s) => s.id === screening.id)).toBe(false);
  });
});

describe("snacks", () => {
  const delivery = { address: "12 Main Road, Aizawl", phone: "+91 98765 43210" };

  it("orders snacks, then the kitchen moves them along", async () => {
    const menu: SnackItem[] = (await request(app).get("/snacks").expect(200)).body;
    expect(menu.length).toBeGreaterThanOrEqual(6);
    const popcorn = menu.find((m) => m.slug === "butter-popcorn")!;
    const tea = menu.find((m) => m.slug === "thingpui")!;

    const { agent } = await signUp();
    const order = await buy(agent, {
      snacks: [{ itemId: popcorn.id, qty: 2 }, { itemId: tea.id, qty: 1 }, { itemId: popcorn.id, qty: 1 }],
      delivery,
    });
    expect(order.amountPaise).toBe(popcorn.pricePaise * 3 + tea.pricePaise);
    expect(order.snackOrder!.status).toBe("PLACED");
    expect(order.snackOrder!.lines).toEqual([
      { name: popcorn.name, unitPaise: popcorn.pricePaise, qty: 3 },
      { name: tea.name, unitPaise: tea.pricePaise, qty: 1 },
    ]);

    // Staff only.
    await agent.get("/admin/snack-orders").expect(403);
    const staff = await signUp();
    await prisma.user.update({ where: { email: staff.email }, data: { role: "ADMIN" } });
    const queue = (await staff.agent.get("/admin/snack-orders").expect(200)).body as { id: string }[];
    expect(queue.map((q) => q.id)).toContain(order.snackOrder!.id);

    const id = order.snackOrder!.id;
    await staff.agent.patch(`/admin/snack-orders/${id}`).send({ status: "DELIVERED" }).expect(409);
    for (const status of ["ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      const res = await staff.agent.patch(`/admin/snack-orders/${id}`).send({ status }).expect(200);
      expect(res.body.status).toBe(status);
    }
    const mine: Order = (await agent.get(`/orders/${order.id}`).expect(200)).body;
    expect(mine.snackOrder!.status).toBe("DELIVERED");
  });

  it("bundles snacks with a ticket and validates delivery times", async () => {
    const menu: SnackItem[] = (await request(app).get("/snacks").expect(200)).body;
    const drink = menu.find((m) => m.slug === "cold-drink")!;
    const movie = await getTitle("tears-of-steel");
    const { agent } = await signUp();

    const past = await agent.post("/orders").send({
      snacks: [{ itemId: drink.id, qty: 1 }],
      delivery: { ...delivery, when: "SCHEDULED", scheduledFor: new Date(Date.now() - HOUR).toISOString() },
    });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe("invalid_delivery_time");

    const soon = new Date(Date.now() + 2 * HOUR).toISOString();
    const combo = await buy(agent, {
      titleId: movie.id,
      snacks: [{ itemId: drink.id, qty: 2 }],
      delivery: { ...delivery, when: "SCHEDULED", scheduledFor: soon },
    });
    expect(combo.amountPaise).toBe(movie.pricePaise + drink.pricePaise * 2);
    expect(combo.tickets).toHaveLength(1);
    expect(combo.snackOrder!.scheduledFor).toBe(soon);

    await prisma.snackItem.update({ where: { id: drink.id }, data: { available: false } });
    const gone = await agent.post("/orders").send({ snacks: [{ itemId: drink.id, qty: 1 }], delivery });
    expect(gone.status).toBe(409);
    await prisma.snackItem.update({ where: { id: drink.id }, data: { available: true } });
  });
});

describe("box office", () => {
  it("ranks titles by tickets sold this week", async () => {
    const hit = await freshMovie();
    const flop = await freshMovie();
    // Enough sales to beat everything the other tests bought.
    const { agent } = await signUp();
    await buy(agent, { titleId: hit.id, quantity: 10 });
    await buy(agent, { titleId: hit.id, quantity: 10 });
    await buy(agent, { titleId: flop.id, quantity: 1 });

    const chart: BoxOffice = (await request(app).get("/box-office").expect(200)).body;
    const hitEntry = chart.entries.find((e) => e.title.id === hit.id)!;
    expect(hitEntry.rank).toBe(1);
    expect(hitEntry.tickets).toBe(20);
    expect(hitEntry.trend).toBe("NEW");
    const flopEntry = chart.entries.find((e) => e.title.id === flop.id);
    if (flopEntry) expect(flopEntry.rank).toBeGreaterThan(1);

    // Last week's sales count as the previous period.
    await prisma.order.updateMany({
      where: { tickets: { some: { titleId: hit.id } } },
      data: { paidAt: new Date(Date.now() - 8 * 24 * HOUR) },
    });
    const next: BoxOffice = (await request(app).get("/box-office").expect(200)).body;
    expect(next.entries.find((e) => e.title.id === hit.id)).toBeUndefined();

    const staff = await signUp();
    await prisma.user.update({ where: { email: staff.email }, data: { role: "ADMIN" } });
    const sales = (await staff.agent.get("/admin/sales?days=30").expect(200)).body as { titleId: string; tickets: number; grossPaise: number }[];
    expect(sales.find((s) => s.titleId === hit.id)).toMatchObject({ tickets: 20, grossPaise: 20 * 9900 });
  });
});

describe("razorpay", () => {
  it("verifies checkout and webhook signatures", async () => {
    const { verifyPaymentSignature, verifyWebhookSignature } = await import("../src/lib/razorpay.js");
    const sig = createHmac("sha256", "s3cret").update("order_1|pay_1").digest("hex");
    expect(verifyPaymentSignature("order_1", "pay_1", sig, "s3cret")).toBe(true);
    expect(verifyPaymentSignature("order_1", "pay_2", sig, "s3cret")).toBe(false);
    expect(verifyPaymentSignature("order_1", "pay_1", "short", "s3cret")).toBe(false);
    expect(verifyPaymentSignature("order_1", "pay_1", sig, "")).toBe(false);

    const body = Buffer.from('{"event":"order.paid"}');
    const wsig = createHmac("sha256", "whk").update(body).digest("hex");
    expect(verifyWebhookSignature(body, wsig, "whk")).toBe(true);
    expect(verifyWebhookSignature(Buffer.from('{"event":"x"}'), wsig, "whk")).toBe(false);
  });

  it("marks orders paid from a signed webhook", async () => {
    vi.resetModules();
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whk-test");
    const { createApp } = await import("../src/app.js");
    const hookApp = createApp();

    const { agent, email } = await signUp();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const movie = await getTitle("signal-test");
    const rzpOrderId = `order_${uniq()}`;
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        amountPaise: movie.pricePaise,
        provider: "razorpay",
        providerOrderId: rzpOrderId,
        expiresAt: new Date(Date.now() + HOUR),
        tickets: { create: { titleId: movie.id, holderId: user.id, tier: "STANDARD", pricePaise: movie.pricePaise } },
      },
    });

    const payload = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_123", order_id: rzpOrderId } } },
    });
    await request(hookApp).post("/payments/razorpay/webhook").set("content-type", "application/json").set("x-razorpay-signature", "bad").send(payload).expect(400);
    const sig = createHmac("sha256", "whk-test").update(payload).digest("hex");
    await request(hookApp).post("/payments/razorpay/webhook").set("content-type", "application/json").set("x-razorpay-signature", sig).send(payload).expect(200);
    // Retries are harmless.
    await request(hookApp).post("/payments/razorpay/webhook").set("content-type", "application/json").set("x-razorpay-signature", sig).send(payload).expect(200);

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.providerPaymentId).toBe("pay_123");
    await play(agent, movie.id).expect(200);
    vi.unstubAllEnvs();
  });
});
