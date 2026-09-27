import type { Metadata } from "next";
import { SubscribeButton } from "@/components/SubscribeButton";
import { getMe, getPlans } from "@/lib/api-server";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  const [{ plans, devBilling }, me] = await Promise.all([getPlans(), getMe()]);
  const currentPlan = me?.canWatch ? me.subscription?.planId : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pt-28">
      <div className="space-y-2 text-center">
        <h1 className="text-4xl font-black">Choose your plan</h1>
        <p className="text-muted">Cancel anytime. Every plan includes the full catalog.</p>
        {devBilling && (
          <p className="mx-auto w-fit rounded bg-amber-500/15 px-3 py-1 text-sm text-amber-300">
            Dev billing: Stripe is not configured, so plans activate instantly without payment.
          </p>
        )}
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col gap-4 rounded-xl border p-6 ${plan.id === "standard" ? "border-brand bg-brand/5" : "border-white/10 bg-panel"}`}
          >
            <div>
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <p className="mt-1 text-3xl font-black">
                {formatPrice(plan.priceCents, plan.currency)}
                <span className="text-base font-normal text-muted">/{plan.interval}</span>
              </p>
            </div>
            <ul className="flex-1 space-y-2 text-sm">
              {plan.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <SubscribeButton planId={plan.id} current={currentPlan === plan.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
