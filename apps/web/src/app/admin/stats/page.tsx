import type { Metadata } from "next";
import Link from "next/link";
import type { AdminStats } from "@ott/shared";
import { BarRows, DayBars, DropOff, StatTile } from "@/components/admin/StatsCharts";
import { apiGet } from "@/lib/api-server";
import { formatDuration, formatInr, formatShowtime } from "@/lib/format";

export const metadata: Metadata = { title: "Statistics · Staff" };

const PRESETS = [7, 30, 90];
const NUM = "[font-variant-numeric:lining-nums_tabular-nums]";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const TIER_NAME = { STANDARD: "Standard", TOGETHER: "Together" } as const;

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const q = await searchParams;
  const custom = q.from && q.to && DATE.test(q.from) && DATE.test(q.to) && q.from <= q.to;
  const days = PRESETS.includes(Number(q.days)) ? Number(q.days) : 30;
  const stats = await apiGet<AdminStats>(`/admin/stats?${custom ? `from=${q.from}&to=${q.to}` : `days=${days}`}`);
  const { money, audience, watching } = stats;
  const films = watching.byTitle.filter((f) => f.viewers > 0).slice(0, 6);

  return (
    <div className="space-y-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="display text-[clamp(40px,5vw,68px)]">Statistics</h1>
        <div className="flex flex-wrap items-end gap-4">
          <nav className="flex gap-2" aria-label="Date range">
            {PRESETS.map((d) => (
              <Link key={d} href={`/admin/stats?days=${d}`} aria-current={!custom && d === days ? "page" : undefined}
                className={`chip h-9 px-4 text-[13px] ${!custom && d === days ? "chip-ox" : "hover:text-ink"}`}>
                {d} days
              </Link>
            ))}
          </nav>
          {/* A plain GET form, so it works without any client script. */}
          <form className="flex flex-wrap items-end gap-2" action="/admin/stats">
            <label className="grid text-[12px] text-ink-3">From
              <input type="date" name="from" required defaultValue={custom ? q.from : ""} className="field h-9 w-36 text-[14px]" />
            </label>
            <label className="grid text-[12px] text-ink-3">To
              <input type="date" name="to" required defaultValue={custom ? q.to : ""} className="field h-9 w-36 text-[14px]" />
            </label>
            <button className="btn btn-sm btn-ghost" type="submit">Apply</button>
          </form>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Headlines">
        <StatTile label="Ticket sales" value={formatInr(money.grossPaise)} hint={`${money.tickets} tickets`} />
        <StatTile label="Snack sales" value={formatInr(money.snackPaise)} hint={`${money.snackOrders} orders`} />
        <StatTile label="Watching now" value={String(watching.viewersNow)} hint="seen in the last 90 seconds" />
        <StatTile label="New accounts" value={String(audience.signUps)} hint={`${audience.buyers} bought · ${audience.repeatBuyers} came back`} />
      </section>

      <section>
        <h2 className="headline mb-4 text-[26px]">Sales by day</h2>
        <div className="panel p-5"><DayBars days={money.byDay} /></div>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="headline mb-4 text-[26px]">By film</h2>
          <div className="panel p-5">
            <BarRows rows={money.byTitle.map((t) => ({ key: t.titleId, label: t.name, value: t.grossPaise, text: formatInr(t.grossPaise), sub: `${t.tickets} tickets` }))} />
          </div>
        </div>
        <div className="grid content-start gap-10">
          <div>
            <h2 className="headline mb-4 text-[26px]">By ticket type</h2>
            <div className="panel p-5">
              <BarRows rows={money.byTier.map((t) => ({ key: t.tier, label: TIER_NAME[t.tier], value: t.grossPaise, text: formatInr(t.grossPaise), sub: `${t.tickets} tickets` }))} />
            </div>
          </div>
          <div>
            <h2 className="headline mb-4 text-[26px]">Gift codes</h2>
            <div className={`panel p-5 ${NUM}`}>
              <b>{money.giftsRedeemed}</b> of <b>{money.giftsIssued}</b> sold in this range have been redeemed.
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="headline mb-4 text-[26px]">Watching</h2>
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <StatTile label="Average watch time" value={formatDuration(watching.avgWatchSec)} />
          <StatTile label="Finished the film" value={pct(watching.completionRate)} />
        </div>
        {films.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{films.map((f) => <DropOff key={f.titleId} film={f} />)}</div>
        ) : (
          <p className="text-ink-3">Nobody has watched anything in this range yet.</p>
        )}
        <p className="mt-3 text-sm text-ink-3">Each curve shows how many viewers were still watching at every tenth of the film. For series, episodes are mixed together.</p>
      </section>

      <section>
        <h2 className="headline mb-4 text-[26px]">Opening nights</h2>
        <div className="panel p-5">
          <BarRows
            rows={stats.openingNights.map((s) => ({
              key: s.id, label: `${s.name} · ${formatShowtime(s.startsAt)}`, value: s.sold / s.capacity,
              text: `${s.sold}/${s.capacity} seats`, sub: s.joinedNow ? `${s.joinedNow} joined now` : undefined,
            }))}
          />
        </div>
      </section>

      <section>
        <h2 className="headline mb-4 text-[26px]">Ratings</h2>
        <div className="panel divide-y divide-[var(--line)] px-5">
          {stats.ratings.map((r) => (
            <div key={r.titleId} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="font-semibold">{r.name}</span>
              <span className={`text-ink-2 ${NUM}`}>
                <b className="text-ink">{pct(r.approval)}</b> liked · {r.loved} loved · {r.liked} liked · {r.disliked} not for me
              </span>
            </div>
          ))}
          {stats.ratings.length === 0 && <p className="py-4 text-ink-3">No ratings yet.</p>}
        </div>
      </section>

      <p className="border-t border-[var(--line)] pt-6 text-sm text-ink-3">
        Page visits and how many visitors become buyers aren’t tracked yet, so they aren’t shown here. Days follow India time.
      </p>
    </div>
  );
}
