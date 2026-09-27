import type { Metadata } from "next";
import { Player } from "@/components/Player";

export const metadata: Metadata = { title: "Watch" };

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ titleId: string }>;
  searchParams: Promise<{ episode?: string }>;
}) {
  const [{ titleId }, { episode }] = await Promise.all([params, searchParams]);
  return <Player key={`${titleId}:${episode ?? ""}`} titleId={titleId} episodeId={episode} />;
}
