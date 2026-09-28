import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "./errors.js";

const API = "https://api.razorpay.com/v1";

function safeEqualHex(expectedHex: string, actual: string) {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout success callback: HMAC-SHA256("<order_id>|<payment_id>", key_secret). */
export function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
  keySecret = config.RAZORPAY_KEY_SECRET,
) {
  if (!keySecret) return false;
  const expected = createHmac("sha256", keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhooks: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string, webhookSecret = config.RAZORPAY_WEBHOOK_SECRET) {
  if (!webhookSecret) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Creates a Razorpay order; the client completes it with Razorpay Checkout. */
export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  const auth = Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
  });
  if (!res.ok) {
    console.error("Razorpay order creation failed", res.status, await res.text().catch(() => ""));
    throw new HttpError(502, "payment_provider_error", "Could not start the payment. Please try again.");
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}
