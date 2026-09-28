import { Router } from "express";
import { redeemGiftSchema } from "@ott/shared";
import { prisma } from "../lib/db.js";
import { HttpError } from "../lib/errors.js";
import { ticketInclude, toTicket } from "../lib/tickets.js";
import { requireAuth } from "../middleware/auth.js";

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

/** Tickets you hold, plus extras you bought that are waiting to be gifted. */
ticketsRouter.get("/", async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    where: {
      order: { status: "PAID" },
      OR: [{ holderId: req.userId! }, { holderId: null, order: { userId: req.userId! } }],
    },
    include: ticketInclude,
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  res.json(tickets.map((t) => toTicket(t, req.userId!, now)));
});

/** Claims a gifted ticket by its code. */
ticketsRouter.post("/redeem", async (req, res) => {
  const { code } = redeemGiftSchema.parse(req.body);
  const ticket = await prisma.ticket.findUnique({ where: { giftCode: code }, include: { order: true } });
  if (!ticket || ticket.order.status !== "PAID") throw new HttpError(404, "gift_not_found", "That gift code doesn't exist");
  const claimed = await prisma.ticket.updateMany({ where: { id: ticket.id, holderId: null }, data: { holderId: req.userId! } });
  if (!claimed.count) throw new HttpError(409, "gift_redeemed", "That gift has already been redeemed");
  const full = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, include: ticketInclude });
  res.json(toTicket(full, req.userId!));
});
