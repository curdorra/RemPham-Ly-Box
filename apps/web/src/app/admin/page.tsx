import type { Metadata } from "next";
import type { SnackOrder, TitleSummary } from "@ott/shared";
import { ShowtimeEditor, SnackQueue } from "@/components/StaffTools";
import { apiGet, getCinema } from "@/lib/api-server";
import { formatInr } from "@/lib/format";

export const metadata: Metadata = { title: "Staff" };

export default async function AdminPage() {
  const [orders, schedule, catalog, sales] = await Promise.all([
    apiGet<SnackOrder[]>("/admin/snack-orders"),
    getCinema(14),
    apiGet<{ items: TitleSummary[] }>("/catalog/titles?limit=100"),
    apiGet<{ titleId: string; name: string; tickets: number; grossPaise: number }[]>("/admin/sales?days=30"),
  ]);
  return (
    <div className="space-y-16">
      <h1 className="display text-[clamp(40px,5vw,68px)]">Overview</h1>
      <section>
        <h2 className="headline mb-4 text-[26px]">Cinema showtimes</h2>
        <ShowtimeEditor schedule={schedule} titles={catalog.items} />
      </section>
      <section>
        <h2 className="headline mb-4 text-[26px]">Snack orders</h2>
        <SnackQueue orders={orders} />
      </section>
      <section>
        <h2 className="headline mb-4 text-[26px]">Sales · last 30 days</h2>
        <div className="panel divide-y divide-[var(--line)] px-5">
          {sales.map((s) => (
            <div key={s.titleId} className="flex justify-between py-3">
              <span className="text-[17px] font-semibold">{s.name}</span>
              <span className="[font-variant-numeric:lining-nums_tabular-nums] text-ink-2">{s.tickets} tickets · <b className="text-ink">{formatInr(s.grossPaise)}</b></span>
            </div>
          ))}
          {sales.length === 0 && <p className="py-4 text-ink-3">No sales yet.</p>}
        </div>
      </section>
    </div>
  );
}
