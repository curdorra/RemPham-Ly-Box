import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TitleGrid } from "@/components/TitleGrid";
import { getMe, getMyList } from "@/lib/api-server";

export const metadata: Metadata = { title: "My List" };

export default async function MyListPage() {
  if (!(await getMe())) redirect("/login?next=/my-list");
  const titles = await getMyList();
  return (
    <div className="gutter space-y-10 pt-32">
      <div className="flex items-baseline gap-5">
        <h1 className="display text-[clamp(36px,4.6vw,56px)]">My List</h1>
        <span className="text-[13px] tracking-[.04em] text-ink-2">{titles.length} saved</span>
      </div>
      {titles.length ? <TitleGrid titles={titles} /> : <p className="font-serif text-[28px]">Nothing saved here yet.</p>}
    </div>
  );
}
