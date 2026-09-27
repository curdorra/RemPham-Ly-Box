import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_PRICE_BASIC: z.string().optional().default(""),
  STRIPE_PRICE_STANDARD: z.string().optional().default(""),
  STRIPE_PRICE_PREMIUM: z.string().optional().default(""),
  CDN_SIGNING_KEY: z.string().optional().default(""),
  PLAYBACK_TTL_SEC: z.coerce.number().int().min(60).default(4 * 60 * 60),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";

/** Without a Stripe key (outside production) checkout activates plans directly. */
export const devBilling = !config.STRIPE_SECRET_KEY && !isProd;

if (isProd && !config.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY is required in production");
  process.exit(1);
}
