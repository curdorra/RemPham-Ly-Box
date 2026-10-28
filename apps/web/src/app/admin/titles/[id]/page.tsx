import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AdminSubtitles, AdminTitle } from "@ott/shared";
import { DeleteTitle } from "@/components/admin/DeleteTitle";
import { EpisodeManager } from "@/components/admin/EpisodeManager";
import { SubtitleManager } from "@/components/admin/SubtitleManager";
import { TitleForm } from "@/components/admin/TitleForm";
import { VideoUpload } from "@/components/admin/VideoUpload";
import { ApiError, apiGet } from "@/lib/api-server";

export const metadata: Metadata = { title: "Edit title · Staff" };

export default async function EditTitlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [title, genres] = await Promise.all([
    apiGet<AdminTitle>(`/admin/titles/${encodeURIComponent(id)}`).catch((e) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }),
    apiGet<string[]>("/admin/genres"),
  ]);
  // Storage hiccups shouldn't take the whole edit page down.
  const subtitles = title.type === "MOVIE" ? await apiGet<AdminSubtitles>(`/admin/titles/${title.id}/subtitles`).catch(() => null) : null;
  return (
    <div className="max-w-4xl">
      <Link href="/admin/titles" className="text-sm text-ink-3 hover:text-ink">← Films & series</Link>
      <div className="mt-3 mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[clamp(40px,5vw,68px)]">{title.name}</h1>
        <div className="flex items-center gap-4 text-sm text-ink-2">
          <span>{title.ticketsSold} tickets sold</span>
          {title.published && <Link href={`/title/${title.slug}`} className="text-gold hover:underline">View on site ↗</Link>}
        </div>
      </div>
      {/* Keyed so a save that changes the record (e.g. scheduled → published) re-seeds the form. */}
      <TitleForm key={title.id} title={title} genres={genres} />
      {title.type === "SERIES" && <EpisodeManager title={title} />}
      {title.type === "MOVIE" && <VideoUpload titleId={title.id} initial={title.video} hasStream={!!title.manifestUrl} />}
      {title.type === "MOVIE" && <SubtitleManager titleId={title.id} initial={subtitles} />}
      <DeleteTitle id={title.id} name={title.name} canDelete={title.ticketsSold === 0} />
    </div>
  );
}
