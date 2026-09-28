import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Ticket, TicketState } from "@ott/shared";
import { AccountActions, RedeemGift } from "@/components/AccountActions";
import { getMe, getTickets } from "@/lib/api-server";

export const metadata: Metadata = { title: "Account" };

const STATE_LABEL: Record<TicketState, string> = {
  UPCOMING: "Opening night",
  LIVE: "Live now",
  READY: "Ready to watch",
  ACTIVE: "Watching",
  EXPIRED: "Expired",
};

function describe(t: Ticket) {
  if (t.state === "UPCOMING" && t.screening) return `Opens ${new Date(t.screening.startsAt).toLocaleString()}`;
  if (t.state === "ACTIVE" && t.expiresAt) return `Until ${new Date(t.expiresAt).toLocaleString()}`;
  if (t.state === "READY") return `${t.title.rentalHours}h window starts when you press play`;
  return STATE_LABEL[t.state];
}

export default async function AccountPage() {
  const me = await getMe();
  if (!me) redirect("/login?next=/account");
  const tickets = await getTickets();
  const held = tickets.filter((t) => !t.isGiftForOthers);
  const gifts = tickets.filter((t) => t.isGiftForOthers);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pt-28">
      <h1 className="text-3xl font-bold">Account</h1>
      <section className="space-y-1 rounded-lg bg-panel p-6">
        <p className="text-sm text-muted">Profile</p>
        <p className="font-semibold">{me.name}</p>
        <p className="text-white/80">{me.email}</p>
      </section>

      <section className="space-y-4 rounded-lg bg-panel p-6">
        <p className="text-sm text-muted">Your tickets</p>
        {held.length === 0 && <p>No tickets yet.</p>}
        <ul className="space-y-3">
          {held.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">
                  {t.title.name}
                  {t.seat && <span className="ml-2 text-sm text-white/60">Seat {t.seat}</span>}
                  {t.tier === "TOGETHER" && <span className="ml-2 text-sm text-white/60">· {t.screens} screens</span>}
                </p>
                <p className="text-sm text-white/70">{describe(t)}</p>
              </div>
              {(t.state === "READY" || t.state === "ACTIVE" || t.state === "LIVE") && (
                <Link href={`/watch/${t.title.id}`} className="rounded bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-white/80">
                  ▶ Watch
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      {gifts.length > 0 && (
        <section className="space-y-3 rounded-lg bg-panel p-6">
          <p className="text-sm text-muted">Tickets to gift</p>
          <ul className="space-y-2">
            {gifts.map((t) => (
              <li key={t.id} className="flex justify-between gap-4">
                <span>{t.title.name}</span>
                <code className="rounded bg-white/10 px-2 py-0.5">{t.giftCode}</code>
              </li>
            ))}
          </ul>
          <p className="text-xs text-white/60">Send a code to a friend; they redeem it on their account page.</p>
        </section>
      )}

      <section className="space-y-3 rounded-lg bg-panel p-6">
        <p className="text-sm text-muted">Got a gift code?</p>
        <RedeemGift />
      </section>

      <AccountActions />
    </div>
  );
}
