import type { Metadata } from "next";
import Link from "next/link";
import { SectionHead } from "@/components/SectionHead";
import { getScreenings } from "@/lib/api-server";
import { formatShowtime } from "@/lib/format";
import { getT } from "@/lib/lang-server";

export const metadata: Metadata = { title: "Opening nights" };

export default async function OpeningPage() {
  const [screenings, t] = await Promise.all([getScreenings(), getT()]);
  return (
    <div className="gutter pt-36">
      <SectionHead label={t("navOpening")} title={t("everyoneTogether")} sub={t("openingSub")} live />
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {screenings.map((s) => (
          <Link key={s.id} href={`/opening/${s.id}`} className="group panel relative flex gap-5 overflow-hidden p-5">
            <div className="w-28 shrink-0 bg-paper p-1 shadow-[0_0_0_1px_var(--line-2)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.title.posterUrl} alt="" className="aspect-[2/3] w-full rounded-sm object-cover" />
            </div>
            <div className="min-w-0">
              <span className="chip chip-ox">{s.state === "LIVE" ? <><span className="live-dot" />Live now</> : formatShowtime(s.startsAt)}</span>
              <h3 className="display mt-3 text-[40px]">{s.title.name}</h3>
              <p className="mt-2 text-sm text-ink-3">{s.capacity - s.seatsTaken} / {s.capacity} {t("seatsLeft")}</p>
              <span className="mt-4 inline-block text-sm text-gold group-hover:underline">{t("pickSeat")} →</span>
            </div>
          </Link>
        ))}
        {!screenings.length && <p className="text-ink-3">No opening nights scheduled yet.</p>}
      </div>
    </div>
  );
}
