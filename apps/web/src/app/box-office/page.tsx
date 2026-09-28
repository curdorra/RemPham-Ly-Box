import type { Metadata } from "next";
import Link from "next/link";
import { SectionHead } from "@/components/SectionHead";
import { getBoxOffice } from "@/lib/api-server";
import { getT } from "@/lib/lang-server";

export const metadata: Metadata = { title: "Box office" };

const TREND = { UP: ["▲", "text-[#4ade80]"], DOWN: ["▼", "text-[#f87171]"], SAME: ["—", "text-ink-3"], NEW: ["NEW", "text-gold"] } as const;

export default async function BoxOfficePage() {
  const [chart, t] = await Promise.all([getBoxOffice(), getT()]);
  const max = Math.max(1, ...chart.entries.map((e) => e.tickets));
  return (
    <div className="gutter pt-36">
      <SectionHead label={t("navBoxOffice")} title={t("boxOfficeTitle")} sub={t("boxOfficeSub")} />
      <div className="panel mt-9 px-6 py-2 max-sm:px-3">
        {chart.entries.length === 0 && <p className="py-8 text-center text-ink-3">{t("nothingYet")}</p>}
        {chart.entries.map((e) => {
          const [mark, cls] = TREND[e.trend];
          return (
            <Link key={e.title.id} href={`/title/${e.title.slug}`} className="grid grid-cols-[40px_64px_minmax(0,1.2fr)_1.4fr_110px_56px] items-center gap-4.5 border-[var(--line)] py-4 hover:bg-[var(--gold-soft)] max-md:grid-cols-[30px_1fr_90px] [&+&]:border-t">
              <span className={`text-center font-serif text-[38px] italic ${e.rank === 1 ? "text-gold" : "text-ink-3"}`}>{e.rank}</span>
              <span className="aspect-[16/10] w-16 overflow-hidden rounded max-md:hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.title.backdropUrl} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0">
                <b className="block truncate font-serif text-[22px] font-medium italic">{e.title.name}</b>
                <small className="text-[13px] text-ink-3">{e.title.genres.map((g) => g.name).join(" · ")}</small>
              </span>
              <span className="h-1.5 overflow-hidden rounded bg-white/5 max-md:hidden">
                <i className="block h-full rounded bg-[linear-gradient(90deg,var(--color-ox-deep),var(--color-ox)_60%,var(--color-gold))]" style={{ width: `${(e.tickets / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold [font-variant-numeric:lining-nums_tabular-nums]">{e.tickets.toLocaleString("en-IN")} <small className="font-normal text-ink-3">{t("ticketsWord")}</small></span>
              <span className={`text-right text-xs font-bold max-md:hidden ${cls}`}>{mark}{e.previousRank && e.trend !== "SAME" && e.trend !== "NEW" ? ` ${Math.abs(e.previousRank - e.rank)}` : ""}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
