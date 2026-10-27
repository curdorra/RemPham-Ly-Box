import Link from "next/link";
import type { ScreeningSummary } from "@ott/shared";
import { Countdown } from "@/components/Countdown";
import { Hero, type HeroSlide } from "@/components/Hero";
import { Row } from "@/components/Row";
import { SectionHead } from "@/components/SectionHead";
import { getCinema, getHome, getMe, getScreenings, getTickets } from "@/lib/api-server";
import { formatShowtime, formatTime } from "@/lib/format";
import { getT } from "@/lib/lang-server";

export default async function HomePage() {
  const [feed, screenings, cinema, me, t] = await Promise.all([
    getHome(),
    getScreenings().catch((): ScreeningSummary[] => []),
    getCinema(3).catch(() => null),
    getMe().catch(() => null),
    getT(),
  ]);
  const tickets = me ? await getTickets().catch(() => []) : [];
  const playable = new Set(tickets.filter((x) => ["READY", "ACTIVE", "LIVE"].includes(x.state)).map((x) => x.title.id));

  // Hero: the next opening night first, then the personalised pick and popular titles.
  const slides: HeroSlide[] = [];
  const seen = new Set<string>();
  const push = (s: HeroSlide) => {
    if (seen.has(s.title.id) || slides.length >= 4) return;
    seen.add(s.title.id);
    slides.push({ ...s, owned: playable.has(s.title.id) });
  };
  const next = screenings.find((s) => s.state === "UPCOMING");
  if (next) push({ title: next.title, opening: { screeningId: next.id, startsAt: next.startsAt } });
  if (feed.hero) push({ title: feed.hero });
  for (const row of feed.rows) for (const title of row.titles) push({ title });

  const cinemaDays = cinema?.days.filter((d) => d.showtimes.length) ?? [];

  return (
    <>
      <Hero slides={slides} />

      <div id="rows" className="relative z-10 -mt-4 scroll-mt-20">
        {feed.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </div>

      {next && (
        <section id="opening-night" className="gutter mt-28 scroll-mt-24">
          <SectionHead label={t("openingNight")} title={t("everyoneTogether")} sub={t("openingSub")} live />
          <Link href={`/opening/${next.id}`} className="group relative mt-10 grid overflow-hidden rounded-[14px] shadow-[0_0_0_1px_var(--line-2)] lg:grid-cols-[1fr_auto]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={next.title.backdropUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-50" />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(11,7,7,.95)_20%,rgba(11,7,7,.4)),radial-gradient(ellipse_at_0%_100%,rgba(122,22,33,.45),transparent_60%)]" />
            <div className="relative p-8 max-sm:p-5">
              <span className="chip chip-ox"><span className="live-dot" />{formatShowtime(next.startsAt)}</span>
              <h3 className="display mt-4 text-[clamp(44px,5.4vw,80px)]">{next.title.name}</h3>
              <p className="mt-2 text-lg text-ink-2">
                {next.capacity - next.seatsTaken} / {next.capacity} {t("seatsLeft")}
              </p>
              <div className="mt-6 max-w-xl"><Countdown to={next.startsAt} /></div>
              <span className="btn btn-red mt-6">{t("pickSeat")} →</span>
            </div>
            <div className="relative hidden p-8 lg:block">
              <div className="w-44 rounded bg-[#1a100b] p-1.5 shadow-[0_0_0_1px_var(--line-2),0_24px_50px_-16px_#000]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={next.title.posterUrl} alt="" className="aspect-[2/3] w-full rounded-sm object-cover" />
              </div>
            </div>
          </Link>
        </section>
      )}

      {cinema && (
        <section id="at-the-cinema" className="gutter mt-28 scroll-mt-24">
          <SectionHead label={cinema.cinema.name} title={t("cinemaTitle")} sub={t("cinemaSub")} />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {(cinemaDays.length ? cinemaDays : cinema.days.slice(0, 3)).slice(0, 3).map((day, k) => (
              <div key={day.date} className="panel flex flex-col p-5">
                <div className="lbl text-gold">
                  {k === 0 && day.date === cinema.days[0]?.date ? t("today") : new Date(`${day.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
                </div>
                <ul className="mt-3 flex-1 space-y-2">
                  {day.showtimes.length ? (
                    day.showtimes.map((s) => (
                      <li key={s.id} className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[17px] font-semibold">{s.filmName}</span>
                        <span className="shrink-0 text-sm text-ink-2 [font-variant-numeric:lining-nums_tabular-nums]">{formatTime(s.startsAt)}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-ink-3">{t("noShows")}</li>
                  )}
                </ul>
                <a href={day.bookingUrl} target="_blank" rel="noopener" className="btn btn-ghost btn-sm mt-5">
                  {t("bookOnBms")} ↗
                </a>
              </div>
            ))}
          </div>
          <Link href="/cinema" className="mt-5 inline-block text-sm text-gold hover:underline">{t("navCinema")} →</Link>
        </section>
      )}
    </>
  );
}
