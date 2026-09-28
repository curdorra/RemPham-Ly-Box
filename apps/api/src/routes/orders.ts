import express, { Router } from "express";
import { razorpayVerifySchema } from "@ott/shared";
import { devPayments } from "../config.js";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { createOrder, loadOrder, markPaid } from "../lib/orders.js";
import { verifyPaymentSignature, verifyWebhookSignature } from "../lib/razorpay.js";
import { requireAuth } from "../middleware/auth.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

async function viewer(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, "unauthorized", "Sign in to continue");
  return user;
}

/** Starts a checkout for tickets and/or snacks. Seats are held while it is pending. */
ordersRouter.post("/", async (req, res) => {
  const order = await createOrder(await viewer(req.userId!), req.body);
  res.status(201).json(order);
});

ordersRouter.get("/", async (req, res) => {
  const user = await viewer(req.userId!);
  const rows = await prisma.order.findMany({
    where: { userId: user.id, status: { in: ["PAID", "REFUNDED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true },
  });
  res.json(await Promise.all(rows.map((o) => loadOrder(o.id, user))));
});

ordersRouter.get("/:id", async (req, res) => {
  res.json(await loadOrder(req.params.id, await viewer(req.userId!)));
});

async function pendingOrder(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw notFound("Order");
  return order;
}

/** Development only: completes a payment instantly. */
ordersRouter.post("/:id/confirm-dev", async (req, res) => {
  if (!devPayments) throw new HttpError(404, "not_found", "Route not found");
  const order = await pendingOrder(req.params.id, req.userId!);
  if (order.provider !== "dev") throw new HttpError(400, "wrong_provider", "This order is not a dev order");
  await markPaid(order.id, `dev_${Date.now()}`);
  res.json(await loadOrder(order.id, await viewer(req.userId!)));
});

/** Razorpay Checkout success handler posts here with the signed payment ids. */
ordersRouter.post("/:id/razorpay/verify", async (req, res) => {
  const input = razorpayVerifySchema.parse(req.body);
  const order = await pendingOrder(req.params.id, req.userId!);
  if (order.provider !== "razorpay" || order.providerOrderId !== input.razorpay_order_id) {
    throw new HttpError(400, "order_mismatch", "Payment does not belong to this order");
  }
  if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    throw new HttpError(400, "invalid_signature", "Payment could not be verified");
  }
  await markPaid(order.id, input.razorpay_payment_id);
  res.json(await loadOrder(order.id, await viewer(req.userId!)));
});

interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string } };
    order?: { entity: { id: string } };
  };
}

/**
 * Source of truth for payments: covers buyers who close the tab before the
 * checkout callback. Needs the raw body for signature verification.
 */
export const razorpayWebhookHandler = [
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req: express.Request, res: express.Response) => {
    const signature = req.header("x-razorpay-signature");
    if (!signature || !Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, signature)) {
      throw new HttpError(400, "invalid_signature", "Invalid webhook signature");
    }
    const event = JSON.parse(req.body.toString("utf8")) as RazorpayEvent;
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const razorpayOrderId = event.payload.payment?.entity.order_id ?? event.payload.order?.entity.id;
      const paymentId = event.payload.payment?.entity.id ?? "webhook";
      if (razorpayOrderId) {
        const order = await prisma.order.findUnique({ where: { providerOrderId: razorpayOrderId } });
        if (order) await markPaid(order.id, paymentId);
      }
    }
    res.json({ received: true });
  },
] as const;
