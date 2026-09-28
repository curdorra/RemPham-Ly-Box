import { randomBytes } from "node:crypto";
import { TICKET_TIERS } from "@ott/shared";
import type { CreateOrderInput, Order as OrderDto, PaymentCheckout, SnackOrder as SnackOrderDto } from "@ott/shared";
import { createOrderSchema } from "@ott/shared";
import { Prisma } from "../generated/prisma/client.js";
import type { Kitchen, Order, SnackOrder, SnackOrderLine } from "../generated/prisma/client.js";
import { config, devPayments } from "../config.js";
import { prisma } from "./db.js";
import { HttpError, notFound } from "./errors.js";
import { createRazorpayOrder } from "./razorpay.js";
import { ROW_LETTERS, screeningState, ticketInclude, toTicket } from "./tickets.js";

type Tx = Prisma.TransactionClient;

const MAX_SCHEDULE_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pending orders past their hold expire and give their seats back. Cheap to
 * call before anything that reads or claims seats.
 */
export async function expireStaleOrders(db: Tx | typeof prisma = prisma, now = new Date()) {
  const stale = await db.order.findMany({ where: { status: "PENDING", expiresAt: { lt: now } }, select: { id: true } });
  if (!stale.length) return;
  const ids = stale.map((o) => o.id);
  await db.order.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "EXPIRED" } });
  await db.ticket.updateMany({ where: { orderId: { in: ids } }, data: { seat: null } });
  await db.snackOrder.updateMany({ where: { orderId: { in: ids } }, data: { status: "CANCELED" } });
}

/** Seats already sold or held by an unexpired pending order. */
export async function takenSeats(db: Tx | typeof prisma, screeningId: string) {
  const rows = await db.ticket.findMany({
    where: { screeningId, seat: { not: null }, order: { status: { in: ["PENDING", "PAID"] } } },
    select: { seat: true },
  });
  return new Set(rows.map((r) => r.seat!));
}

export function seatLabels(rows: number, seatsPerRow: number) {
  const labels: string[] = [];
  for (let r = 0; r < rows; r++) for (let n = 1; n <= seatsPerRow; n++) labels.push(`${ROW_LETTERS[r]}${n}`);
  return labels;
}

/** Best free seats first: middle rows, then closest to the centre of the row. */
function bestFreeSeats(rows: number, seatsPerRow: number, taken: Set<string>, count: number) {
  const midRow = (rows - 1) * 0.55;
  const midSeat = (seatsPerRow + 1) / 2;
  return seatLabels(rows, seatsPerRow)
    .filter((s) => !taken.has(s))
    .map((s) => {
      const r = ROW_LETTERS.indexOf(s[0]!);
      const n = Number(s.slice(1));
      return { s, score: Math.abs(r - midRow) * 1.5 + Math.abs(n - midSeat) };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((x) => x.s);
}

function giftCode() {
  // Unambiguous alphabet: no 0/O, 1/I/L.
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i]! % alphabet.length];
  return `RLB-${code.slice(0, 4)}-${code.slice(4)}`;
}

interface TicketPlan {
  titleId: string;
  tier: "STANDARD" | "TOGETHER";
  unitPaise: number;
  screeningId: string | null;
  seats: (string | null)[];
}

async function planTickets(tx: Tx, input: ReturnType<typeof createOrderSchema.parse>, now: Date): Promise<TicketPlan | null> {
  if (!input.titleId) return null;
  const title = await tx.title.findFirst({
    where: { id: input.titleId, published: true },
    include: { screenings: { orderBy: { startsAt: "asc" } } },
  });
  if (!title) throw notFound("Title");
  const tier = TICKET_TIERS[input.tier];

  if (!input.screeningId) {
    // A title whose opening night hasn't happened yet is only sold for that night.
    const premiered = title.screenings.some((s) => s.startsAt <= now);
    if (title.screenings.length && !premiered) {
      throw new HttpError(409, "opening_night_only", "This film opens with an opening night. Book a seat for it first.");
    }
    return {
      titleId: title.id,
      tier: input.tier,
      unitPaise: title.pricePaise + tier.addPaise,
      screeningId: null,
      seats: Array(input.quantity).fill(null),
    };
  }

  const screening = title.screenings.find((s) => s.id === input.screeningId);
  if (!screening) throw notFound("Screening");
  if (screeningState(screening, title, now) === "ENDED") {
    throw new HttpError(409, "screening_ended", "This screening has ended");
  }

  const valid = new Set(seatLabels(screening.rows, screening.seatsPerRow));
  const taken = await takenSeats(tx, screening.id);
  let seats: string[];
  if (input.seats) {
    const bad = input.seats.find((s) => !valid.has(s));
    if (bad) throw new HttpError(400, "invalid_seat", `Seat ${bad} does not exist`);
    const clash = input.seats.filter((s) => taken.has(s));
    if (clash.length) throw new HttpError(409, "seat_taken", "Someone just took one of those seats", { seats: clash });
    seats = input.seats;
  } else {
    seats = bestFreeSeats(screening.rows, screening.seatsPerRow, taken, input.quantity);
  }
  if (seats.length < input.quantity) throw new HttpError(409, "sold_out", "Not enough seats left");

  return {
    titleId: title.id,
    tier: input.tier,
    unitPaise: (screening.pricePaise ?? title.pricePaise) + tier.addPaise,
    screeningId: screening.id,
    seats,
  };
}

async function planSnacks(tx: Tx, input: ReturnType<typeof createOrderSchema.parse>, now: Date) {
  if (!input.snacks?.length) return null;
  const delivery = input.delivery!;
  const ids = [...new Set(input.snacks.map((s) => s.itemId))];
  const items = await tx.snackItem.findMany({ where: { id: { in: ids } }, include: { kitchen: true } });
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const id of ids) {
    const item = byId.get(id);
    if (!item || !item.available || !item.kitchen.active) {
      throw new HttpError(409, "snack_unavailable", "One of those snacks is not available right now", { itemId: id });
    }
  }
  const kitchens = new Set(items.map((i) => i.kitchenId));
  if (kitchens.size > 1) throw new HttpError(400, "multiple_kitchens", "Snacks must come from one kitchen per order");

  let scheduledFor: Date | null = null;
  if (delivery.when === "SCHEDULED") {
    scheduledFor = new Date(delivery.scheduledFor!);
    if (scheduledFor <= now || scheduledFor.getTime() - now.getTime() > MAX_SCHEDULE_AHEAD_MS) {
      throw new HttpError(400, "invalid_delivery_time", "Pick a delivery time within the next 7 days");
    }
  }

  // Merge duplicate lines.
  const qty = new Map<string, number>();
  for (const s of input.snacks) qty.set(s.itemId, (qty.get(s.itemId) ?? 0) + s.qty);
  const lines = [...qty].map(([itemId, q]) => {
    const item = byId.get(itemId)!;
    return { itemId, name: item.name, unitPaise: item.pricePaise, qty: q };
  });
  return {
    kitchenId: items[0]!.kitchenId,
    when: delivery.when,
    scheduledFor,
    address: delivery.address,
    phone: delivery.phone,
    note: delivery.note ?? null,
    lines,
    totalPaise: lines.reduce((sum, l) => sum + l.unitPaise * l.qty, 0),
  };
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createOrder(user: { id: string; name: string; email: string }, body: CreateOrderInput, now = new Date()) {
  const input = createOrderSchema.parse(body);

  let orderId: string;
  try {
    orderId = await prisma.$transaction(async (tx) => {
      await expireStaleOrders(tx, now);
      const tickets = await planTickets(tx, input, now);
      const snacks = await planSnacks(tx, input, now);
      const ticketTotal = tickets ? tickets.unitPaise * tickets.seats.length : 0;
      const amountPaise = ticketTotal + (snacks?.totalPaise ?? 0);

      const order = await tx.order.create({
        data: {
          userId: user.id,
          amountPaise,
          provider: devPayments ? "dev" : "razorpay",
          expiresAt: new Date(now.getTime() + config.ORDER_HOLD_MIN * 60 * 1000),
        },
      });
      if (tickets) {
        await tx.ticket.createMany({
          data: tickets.seats.map((seat, i) => ({
            orderId: order.id,
            titleId: tickets.titleId,
            tier: tickets.tier,
            pricePaise: tickets.unitPaise,
            screeningId: tickets.screeningId,
            seat,
            // The buyer holds the first ticket; the rest are gifts to share.
            holderId: i === 0 ? user.id : null,
            giftCode: i === 0 ? null : giftCode(),
          })),
        });
      }
      if (snacks) {
        await tx.snackOrder.create({
          data: {
            orderId: order.id,
            userId: user.id,
            kitchenId: snacks.kitchenId,
            when: snacks.when,
            scheduledFor: snacks.scheduledFor,
            address: snacks.address,
            phone: snacks.phone,
            note: snacks.note,
            lines: { create: snacks.lines },
          },
        });
      }
      return order.id;
    });
  } catch (e) {
    // Two buyers raced for the same seat; the unique index settled it.
    if (isUniqueViolation(e)) throw new HttpError(409, "seat_taken", "Someone just took one of those seats");
    throw e;
  }

  if (!devPayments) {
    try {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      const razorpayOrderId = await createRazorpayOrder(order.amountPaise, order.id, { userId: user.id });
      await prisma.order.update({ where: { id: orderId }, data: { providerOrderId: razorpayOrderId } });
    } catch (e) {
      await prisma.order.update({ where: { id: orderId }, data: { status: "EXPIRED" } });
      await prisma.ticket.updateMany({ where: { orderId }, data: { seat: null } });
      throw e;
    }
  }
  return loadOrder(orderId, user);
}

/**
 * Marks an order paid. Idempotent, and safe to call from both the checkout
 * callback and the webhook. A payment that lands after the hold expired still
 * counts: seats are re-claimed if free, otherwise the best free seats are used.
 */
export async function markPaid(orderId: string, providerPaymentId: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { tickets: true } });
    if (!order || order.status === "PAID" || order.status === "REFUNDED") return;

    if (order.status === "EXPIRED") {
      const seatless = order.tickets.filter((t) => t.screeningId && !t.seat);
      const screeningId = seatless[0]?.screeningId;
      if (screeningId) {
        const screening = await tx.screening.findUniqueOrThrow({ where: { id: screeningId } });
        const taken = await takenSeats(tx, screeningId);
        const seats = bestFreeSeats(screening.rows, screening.seatsPerRow, taken, seatless.length);
        // Oversold virtual hall: tickets stay valid even without a seat label.
        for (const [i, t] of seatless.entries()) {
          if (seats[i]) await tx.ticket.update({ where: { id: t.id }, data: { seat: seats[i] } });
        }
      }
    }

    await tx.order.update({ where: { id: orderId }, data: { status: "PAID", paidAt: now, providerPaymentId } });
    await tx.snackOrder.updateMany({
      where: { orderId, status: { in: ["AWAITING_PAYMENT", "CANCELED"] } },
      data: { status: "PLACED" },
    });
  });
}

type SnackOrderFull = SnackOrder & { kitchen: Kitchen; lines: SnackOrderLine[] };

export function toSnackOrder(s: SnackOrderFull): SnackOrderDto {
  return {
    id: s.id,
    status: s.status,
    when: s.when,
    scheduledFor: s.scheduledFor?.toISOString() ?? null,
    address: s.address,
    phone: s.phone,
    note: s.note,
    kitchen: { id: s.kitchen.id, name: s.kitchen.name, phone: s.kitchen.phone },
    lines: s.lines.map((l) => ({ name: l.name, unitPaise: l.unitPaise, qty: l.qty })),
    totalPaise: s.lines.reduce((sum, l) => sum + l.unitPaise * l.qty, 0),
    createdAt: s.createdAt.toISOString(),
  };
}

export const orderInclude = {
  tickets: { include: ticketInclude, orderBy: { createdAt: "asc" } },
  snackOrder: { include: { kitchen: true, lines: true } },
} as const;

function checkoutFor(order: Order, user: { name: string; email: string }): PaymentCheckout | null {
  if (order.status !== "PENDING") return null;
  if (order.provider === "dev") return { provider: "dev" };
  if (!order.providerOrderId) return null;
  return {
    provider: "razorpay",
    keyId: config.RAZORPAY_KEY_ID,
    razorpayOrderId: order.providerOrderId,
    amountPaise: order.amountPaise,
    currency: order.currency,
    name: "RemPham Ly Box",
    description: "Tickets & snacks",
    prefill: { name: user.name, email: user.email },
  };
}

export async function loadOrder(orderId: string, user: { id: string; name: string; email: string }): Promise<OrderDto> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id }, include: orderInclude });
  if (!order) throw notFound("Order");
  const now = new Date();
  const status = order.status === "PENDING" && order.expiresAt < now ? "EXPIRED" : order.status;
  return {
    id: order.id,
    status,
    amountPaise: order.amountPaise,
    currency: order.currency,
    expiresAt: order.expiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    tickets: order.tickets.map((t) => toTicket({ ...t, order }, user.id, now)),
    snackOrder: order.snackOrder && toSnackOrder(order.snackOrder),
    checkout: status === "PENDING" ? checkoutFor(order, user) : null,
  };
}
