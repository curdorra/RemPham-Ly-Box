import express, { Router } from "express";
import type Stripe from "stripe";
import { checkoutSchema } from "@ott/shared";
import { config, devBilling } from "../config.js";
import type { SubscriptionStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { HttpError } from "../lib/errors.js";
import { PLANS, findPlan, planForStripePrice, stripePriceFor } from "../lib/plans.js";
import { stripe } from "../lib/stripe.js";
import { requireAuth } from "../middleware/auth.js";

export const billingRouter = Router();

billingRouter.get("/plans", (_req, res) => {
  res.json({ plans: PLANS, devBilling });
});

billingRouter.post("/checkout", requireAuth, async (req, res) => {
  const { planId } = checkoutSchema.parse(req.body);
  const plan = findPlan(planId);
  if (!plan) throw new HttpError(400, "unknown_plan", "Unknown plan");

  if (devBilling) {
    // Local development without Stripe: grant the plan for one period immediately.
    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.subscription.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, planId, status: "ACTIVE", currentPeriodEnd },
      update: { planId, status: "ACTIVE", currentPeriodEnd, cancelAtPeriodEnd: false },
    });
    res.json({ url: `${config.WEB_ORIGIN}/account?checkout=success` });
    return;
  }

  const price = stripePriceFor(planId);
  if (!price) throw new HttpError(500, "plan_misconfigured", `No Stripe price configured for plan "${planId}"`);

  const customer = await ensureStripeCustomer(req.userId!);
  const session = await stripe!.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: req.userId!,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { userId: req.userId! } },
    success_url: `${config.WEB_ORIGIN}/account?checkout=success`,
    cancel_url: `${config.WEB_ORIGIN}/plans?checkout=canceled`,
  });
  res.json({ url: session.url });
});

billingRouter.post("/portal", requireAuth, async (req, res) => {
  if (devBilling) {
    // No portal in dev billing: cancel at period end to mimic the flow.
    await prisma.subscription.updateMany({ where: { userId: req.userId! }, data: { cancelAtPeriodEnd: true } });
    res.json({ url: `${config.WEB_ORIGIN}/account` });
    return;
  }
  const customer = await ensureStripeCustomer(req.userId!);
  const session = await stripe!.billingPortal.sessions.create({
    customer,
    return_url: `${config.WEB_ORIGIN}/account`,
  });
  res.json({ url: session.url });
});

/** Mounted with a raw body parser (see app.ts) so the signature can be verified. */
export const stripeWebhookHandler = [
  express.raw({ type: "application/json" }),
  async (req: express.Request, res: express.Response) => {
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) throw new HttpError(404, "not_found", "Billing is not configured");

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.header("stripe-signature") ?? "", config.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new HttpError(400, "invalid_signature", "Invalid webhook signature");
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.subscription) {
          const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe.subscriptions.retrieve(id));
        }
        break;
      }
    }
    res.json({ received: true });
  },
];

async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe!.customers.create({ email: user.email, name: user.name, metadata: { userId } });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
  paused: "CANCELED",
};

async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user =
    (sub.metadata.userId && (await prisma.user.findUnique({ where: { id: sub.metadata.userId } }))) ||
    (await prisma.user.findUnique({ where: { stripeCustomerId: customerId } }));
  if (!user) {
    console.warn(`Stripe subscription ${sub.id} has no matching user`);
    return;
  }

  const item = sub.items.data[0];
  const planId = (item && planForStripePrice(item.price.id)) ?? "unknown";
  // Newer Stripe API versions report the billing period on the item.
  const periodEndSec = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const data = {
    planId,
    status: STATUS_MAP[sub.status],
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: new Date((periodEndSec ?? Date.now() / 1000) * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
  await prisma.subscription.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
}
