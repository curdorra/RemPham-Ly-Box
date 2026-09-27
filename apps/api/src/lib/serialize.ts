import type { Episode as EpisodeDto, TitleSummary } from "@ott/shared";
import type { Episode, Genre, Title } from "../generated/prisma/client.js";

export const titleSummaryInclude = { genres: { orderBy: { name: "asc" } } } as const;

export function toTitleSummary(t: Title & { genres: Genre[] }): TitleSummary {
  return {
    id: t.id,
    slug: t.slug,
    type: t.type,
    name: t.name,
    synopsis: t.synopsis,
    year: t.year,
    maturity: t.maturity,
    posterUrl: t.posterUrl,
    backdropUrl: t.backdropUrl,
    genres: t.genres.map((g) => ({ slug: g.slug, name: g.name })),
    durationSec: t.durationSec,
  };
}

export function toEpisode(e: Episode): EpisodeDto {
  return {
    id: e.id,
    number: e.number,
    name: e.name,
    synopsis: e.synopsis,
    durationSec: e.durationSec,
    thumbnailUrl: e.thumbnailUrl,
  };
}
