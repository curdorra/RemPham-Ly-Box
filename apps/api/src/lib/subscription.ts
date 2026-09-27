import { prisma } from "./db.js";

const ENTITLED = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  return !!sub && ENTITLED.has(sub.status) && sub.currentPeriodEnd > new Date();
}
