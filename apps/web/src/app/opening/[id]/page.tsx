import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { SeatMap } from "@/components/SeatMap";
import { ApiError, getMe, getScreening } from "@/lib/api-server";
import { formatShowtime } from "@/lib/format";
import { getT } from "@/lib/lang-server";

export const metadata: Metadata = { title: "Opening night" };

export default async function ScreeningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [screening, me, t] = await Promise.all([
    getScreening(id).catch((e) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }),
    getMe().catch(() => null),
    getT(),
  ]);
  const { title } = screening;
  return (
    <div className="gutter pt-32">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="relative flex min-h-[520px] flex-col justify-end overflow-hidden rounded-[14px] p-8 shadow-[0_0_0_1px_var(--line-2)] max-sm:p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={title.backdropUrl} alt="" className="absolute inset-[-10%] h-[120%] w-[120%] object-cover blur-[34px] brightness-[.55] saturate-[1.2]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(11,7,7,.96)_25%,rgba(11,7,7,.4)_75%,rgba(11,7,7,.15)),radial-gradient(ellipse_at_0%_100%,rgba(122,22,33,.45),transparent_60%)]" />
          <figure className="absolute top-7 right-7 w-32 rounded max-sm:hidden bg-[#1a100b] p-1.5 shadow-[0_0_0_1px_var(--line-2),0_24px_50px_-16px_#000]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={title.posterUrl} alt="" className="aspect-[2/3] w-full rounded-sm object-cover" />
          </figure>
          <div className="relative">
            <span className="chip chip-ox">
              <span className="live-dot" />
              {screening.state === "LIVE" ? "Live now" : `${t("openingNight")} · ${formatShowtime(screening.startsAt)}`}
            </span>
            <h1 className="display mt-4 text-[clamp(48px,5.6vw,80px)]">{title.name}</h1>
            <p className="mt-2.5 text-lg text-ink-2">{formatShowtime(screening.startsAt)}</p>
            <p className="mt-3 max-w-lg text-ink-2">{title.synopsis}</p>
            {screening.state === "UPCOMING" && <div className="mt-6"><Countdown to={screening.startsAt} /></div>}
          </div>
        </div>
        <SeatMap screening={screening} signedIn={!!me} />
      </div>
    </div>
  );
}
