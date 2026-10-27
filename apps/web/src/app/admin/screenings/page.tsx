import type { Metadata } from "next";
import type { AdminScreening, AdminTitleRow } from "@ott/shared";
import { ScreeningManager } from "@/components/admin/ScreeningManager";
import { apiGet } from "@/lib/api-server";

export const metadata: Metadata = { title: "Opening nights · Staff" };

export default async function AdminScreeningsPage() {
  const [screenings, titles] = await Promise.all([
    apiGet<AdminScreening[]>("/admin/screenings"),
    apiGet<AdminTitleRow[]>("/admin/titles"),
  ]);
  const films = titles.filter((t) => t.type === "MOVIE").sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <h1 className="display mb-8 text-[clamp(40px,5vw,68px)]">Opening nights</h1>
      <ScreeningManager screenings={screenings} films={films} />
    </div>
  );
}
