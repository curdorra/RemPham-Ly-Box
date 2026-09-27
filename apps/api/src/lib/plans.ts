import type { Plan } from "@ott/shared";
import { config } from "../config.js";

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    priceCents: 699,
    currency: "usd",
    interval: "month",
    maxQuality: "SD",
    maxStreams: 1,
    features: ["Unlimited movies & series", "Watch on 1 screen", "Standard definition"],
  },
  {
    id: "standard",
    name: "Standard",
    priceCents: 1199,
    currency: "usd",
    interval: "month",
    maxQuality: "HD",
    maxStreams: 2,
    features: ["Everything in Basic", "Watch on 2 screens", "Full HD (1080p)"],
  },
  {
    id: "premium",
    name: "Premium",
    priceCents: 1799,
    currency: "usd",
    interval: "month",
    maxQuality: "UHD",
    maxStreams: 4,
    features: ["Everything in Standard", "Watch on 4 screens", "4K Ultra HD + HDR"],
  },
];

export const findPlan = (id: string) => PLANS.find((p) => p.id === id);

export function stripePriceFor(planId: string): string {
  const prices: Record<string, string> = {
    basic: config.STRIPE_PRICE_BASIC,
    standard: config.STRIPE_PRICE_STANDARD,
    premium: config.STRIPE_PRICE_PREMIUM,
  };
  return prices[planId] ?? "";
}

export function planForStripePrice(priceId: string): string | undefined {
  return PLANS.find((p) => stripePriceFor(p.id) === priceId)?.id;
}
