import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyCode, RedeemGift } from "@/components/AccountActions";
import { ETicket } from "@/components/ETicket";
import { getMe, getTickets } from "@/lib/api-server";
import { getT } from "@/lib/lang-server";

export const metadata: Metadata = { title: "My tickets" };

export default async function AccountPage() {
  const me = await getMe();
  if (!me) redirect("/login?next=/account");
  const [tickets, t] = await Promise.all([getTickets(), getT()]);
  const held = tickets.filter((x) => !x.isGiftForOthers);
  const current = held.filter((x) => x.state !== "EXPIRED");
  const past = held.filter((x) => x.state === "EXPIRED");
  const gifts = tickets.filter((x) => x.isGiftForOthers);
  const labels = {
    seat: t("seat"), where: t("where"), atHome: t("atHome"), validFor: t("validFor"), screens: t("screens"), paidL: t("paidL"), booking: t("booking"),
    anyTime: t("anyTime"), showAtCinema: t("showAtCinema"), hoursToFinish: t("hoursToFinish"), standard: t("standard"), together: t("together"),
  };

  return (
    <div className="gutter pt-36" style={{ "--perf-bg": "var(--color-bg)" } as React.CSSProperties}>
      <div className="eyebrow">{me.name} · {me.email}</div>
      <h1 className="display mt-2 text-[clamp(40px,5vw,68px)]">{t("yourTickets")}</h1>

      {current.length === 0 && <p className="mt-6 text-ink-3">{t("noTickets")} <Link href="/" className="text-gold hover:underline">{t("navHome")} →</Link></p>}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {current.map((x) => (
          <div key={x.id} className="flex flex-col gap-3">
            <ETicket ticket={x} labels={labels} />
            {(x.state === "READY" || x.state === "ACTIVE" || x.state === "LIVE") && (
              <Link href={`/watch/${x.title.id}`} className="btn btn-red">▶ {x.state === "LIVE" ? t("liveNow") : t("watch")}</Link>
            )}
            {x.state === "UPCOMING" && x.screening && (
              <Link href={`/opening/${x.screening.id}`} className="btn btn-ghost">{t("openingNight")} →</Link>
            )}
          </div>
        ))}
      </div>

      {gifts.length > 0 && (
        <section className="panel mt-14 p-6">
          <h2 className="headline text-[26px]">{t("giftsToShare")}</h2>
          <ul className="mt-4 space-y-3">
            {gifts.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[17px] font-semibold">{g.title.name}{g.seat && <small className="ml-2 text-sm font-normal text-ink-3">{t("seat")} {g.seat}</small>}</span>
                <CopyCode code={g.giftCode!} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel mt-8 p-6">
        <h2 className="headline text-[22px]">{t("giftCode")}</h2>
        <div className="mt-3"><RedeemGift /></div>
      </section>

      {past.length > 0 && (
        <section className="mt-14">
          <h2 className="headline text-[22px] text-ink-3">Past</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {past.map((x) => <li key={x.id}><Link href={`/title/${x.title.slug}`} className="chip hover:text-ink">{x.title.name}</Link></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
