"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TICKET_TIERS } from "@ott/shared";
import type { Order, TicketTier, TitleSummary } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { formatInr } from "@/lib/format";

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

/** Pays for a pending order: instantly in dev, otherwise via Razorpay Checkout. */
async function pay(order: Order): Promise<Order> {
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
      handler: resolve,
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.on("payment.failed", () => reject(new Error("Payment failed")));
    rzp.open();
  });
  return api<Order>(`/orders/${order.id}/razorpay/verify`, { body: response });
}

export function BuyTicketButton({ title }: { title: TitleSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState<TicketTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(tier: TicketTier) {
    setBusy(tier);
    setError(null);
    try {
      const order = await api<Order>("/orders", { body: { titleId: title.id, tier } });
      await pay(order);
      router.push(`/watch/${title.id}`);
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) {
        router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
        return;
      }
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  const tiers: { tier: TicketTier; label: string }[] = [
    { tier: "STANDARD", label: `Ticket · ${formatInr(title.pricePaise)}` },
    { tier: "TOGETHER", label: `Watch together (${TICKET_TIERS.TOGETHER.screens} screens) · ${formatInr(title.pricePaise + TICKET_TIERS.TOGETHER.addPaise)}` },
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {tiers.map(({ tier, label }) => (
          <button
            key={tier}
            onClick={() => buy(tier)}
            disabled={busy !== null}
            className={
              tier === "STANDARD"
                ? "rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-hover disabled:opacity-60"
                : "rounded bg-white/15 px-5 py-2 font-semibold hover:bg-white/25 disabled:opacity-60"
            }
          >
            {busy === tier ? "Processing…" : label}
          </button>
        ))}
      </div>
      <p className="text-xs text-white/60">{title.rentalHours} hours to finish, starting when you press play.</p>
      {error && <p className="text-sm text-brand">{error}</p>}
    </div>
  );
}
