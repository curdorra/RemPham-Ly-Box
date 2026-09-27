import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TitleGrid } from "@/components/TitleGrid";
import { getMe, getMyList } from "@/lib/api-server";

export const metadata: Metadata = { title: "My List" };

export default async function MyListPage() {
  if (!(await getMe())) redirect("/login?next=/my-list");
  const titles = await getMyList();
  return (
    <div className="space-y-6 px-4 pt-24 sm:px-10">
      <h1 className="text-3xl font-bold">My List</h1>
      {titles.length ? <TitleGrid titles={titles} /> : <p className="text-muted">Titles you add will show up here.</p>}
    </div>
  );
}
