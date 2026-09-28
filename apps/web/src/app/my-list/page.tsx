import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TitleGrid } from "@/components/TitleGrid";
import { getMe, getMyList } from "@/lib/api-server";

export const metadata: Metadata = { title: "My List" };

export default async function MyListPage() {
  if (!(await getMe())) redirect("/login?next=/my-list");
  const titles = await getMyList();
  return (
    <div className="gutter space-y-8 pt-36">
      <h1 className="display text-[clamp(48px,6vw,80px)]">My List</h1>
      {titles.length ? <TitleGrid titles={titles} /> : <p className="text-ink-3">Titles you add will show up here.</p>}
    </div>
  );
}
