import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/AccountActions";
import { getMe, getPlans } from "@/lib/api-server";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [me, { plans }, { checkout }] = await Promise.all([getMe(), getPlans(), searchParams]);
  if (!me) redirect("/login?next=/account");

  const sub = me.subscription;
  const plan = sub && plans.find((p) => p.id === sub.planId);
  const periodEnd = sub && new Date(sub.currentPeriodEnd).toLocaleDateString();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pt-28">
      <h1 className="text-3xl font-bold">Account</h1>
      {checkout === "success" && (
        <p className="rounded bg-emerald-500/15 px-4 py-3 text-emerald-300">
          You’re subscribed. <Link href="/" className="underline">Start watching</Link>
        </p>
      )}
      <section className="space-y-1 rounded-lg bg-panel p-6">
        <p className="text-sm text-muted">Profile</p>
        <p className="font-semibold">{me.name}</p>
        <p className="text-white/80">{me.email}</p>
      </section>
      <section className="space-y-3 rounded-lg bg-panel p-6">
        <p className="text-sm text-muted">Membership</p>
        {sub && me.canWatch ? (
          <>
            <p className="font-semibold">{plan?.name ?? sub.planId} plan</p>
            <p className="text-sm text-white/80">
              {sub.cancelAtPeriodEnd ? `Ends on ${periodEnd}` : `Renews on ${periodEnd}`}
              {sub.status === "PAST_DUE" && " · Payment past due — update your payment method"}
            </p>
          </>
        ) : (
          <p>
            No active membership. <Link href="/plans" className="text-brand hover:underline">See plans</Link>
          </p>
        )}
        <AccountActions hasSubscription={!!sub} />
      </section>
    </div>
  );
}
