import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(""),
  /** Minutes a pending order holds its seats before they are released. */
  ORDER_HOLD_MIN: z.coerce.number().int().min(1).max(60).default(15),
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

/** Without Razorpay keys (outside production) orders can be confirmed instantly. */
export const devPayments = !config.RAZORPAY_KEY_ID && !isProd;

if (isProd && (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET || !config.RAZORPAY_WEBHOOK_SECRET)) {
  console.error("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required in production");
  process.exit(1);
}
