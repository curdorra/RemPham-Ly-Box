import type { Metadata } from "next";
import { CinemaDays } from "@/components/CinemaDays";
import { SectionHead } from "@/components/SectionHead";
import { getCinema } from "@/lib/api-server";
import { getT } from "@/lib/lang-server";

export const metadata: Metadata = { title: "At the cinema" };

export default async function CinemaPage() {
  const [schedule, t] = await Promise.all([getCinema(7), getT()]);
  return (
    <div className="gutter pt-36">
      <SectionHead label={`${schedule.cinema.name} · ${schedule.cinema.city}`} title={t("cinemaTitle")} sub={t("cinemaSub")} />
      <CinemaDays schedule={schedule} />
    </div>
  );
}
