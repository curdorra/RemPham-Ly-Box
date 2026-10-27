import type { Metadata } from "next";
import Link from "next/link";
import { TitleForm } from "@/components/admin/TitleForm";
import { apiGet } from "@/lib/api-server";

export const metadata: Metadata = { title: "New title · Staff" };

export default async function NewTitlePage() {
  const genres = await apiGet<string[]>("/admin/genres");
  return (
    <div className="max-w-4xl">
      <Link href="/admin/titles" className="text-sm text-ink-3 hover:text-ink">← Films & series</Link>
      <h1 className="display mt-3 mb-8 text-[clamp(40px,5vw,68px)]">New title</h1>
      <TitleForm title={null} genres={genres} />
    </div>
  );
}
