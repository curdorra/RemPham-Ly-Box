"use client";

import type { Order } from "@ott/shared";
import { api } from "./api-client";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: () => void): void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window"));
    document.body.appendChild(s);
  });
}

/** Pays for a pending order: instantly with dev payments, otherwise via Razorpay Checkout. */
export async function payOrder(order: Order): Promise<Order> {
  const checkout = order.checkout;
  if (!checkout) throw new Error("This order can no longer be paid");
  if (checkout.provider === "dev") return api<Order>(`/orders/${order.id}/confirm-dev`, { method: "POST" });

  await loadRazorpay();
  const response = await new Promise<RazorpayResponse>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      theme: { color: "#7a1621" },
      handler: resolve,
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.on("payment.failed", () => reject(new Error("Payment failed")));
    rzp.open();
  });
  return api<Order>(`/orders/${order.id}/razorpay/verify`, { body: response });
}
