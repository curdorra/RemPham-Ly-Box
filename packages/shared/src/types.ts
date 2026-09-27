export type TitleType = "MOVIE" | "SERIES";
export type Maturity = "G" | "PG" | "PG13" | "R" | "NC17" | "TVY" | "TVPG" | "TV14" | "TVMA";
export type SubscriptionStatus =
  | "ACTIVE"
  | "TRIALING"
  | "PAST_DUE"
  | "CANCELED"
  | "INCOMPLETE";

export interface Genre {
  slug: string;
  name: string;
}

export interface TitleSummary {
  id: string;
  slug: string;
  type: TitleType;
  name: string;
  synopsis: string;
  year: number;
  maturity: Maturity;
  posterUrl: string;
  backdropUrl: string;
  genres: Genre[];
  /** Movies only. */
  durationSec: number | null;
}

export interface Episode {
  id: string;
  number: number;
  name: string;
  synopsis: string;
  durationSec: number;
  thumbnailUrl: string;
}

export interface Season {
  id: string;
  number: number;
  name: string;
  episodes: Episode[];
}

export interface TitleDetail extends TitleSummary {
  cast: string[];
  seasons: Season[];
  inMyList: boolean;
}

export interface CatalogRow {
  id: string;
  label: string;
  titles: TitleSummary[];
}

export interface HomeFeed {
  hero: TitleSummary | null;
  rows: CatalogRow[];
}

export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: "month" | "year";
  maxQuality: "SD" | "HD" | "UHD";
  maxStreams: number;
  features: string[];
}

export interface Me {
  id: string;
  email: string;
  name: string;
  subscription: {
    status: SubscriptionStatus;
    planId: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  canWatch: boolean;
}

export interface ContinueWatchingItem {
  title: TitleSummary;
  /** Present when the item is an episode of a series. */
  episode: (Episode & { seasonNumber: number }) | null;
  positionSec: number;
  durationSec: number;
  updatedAt: string;
}

export interface PlaybackInfo {
  /** HLS master manifest URL. */
  manifestUrl: string;
  /** Absolute expiry of the playback grant (ISO). */
  expiresAt: string;
  resumeFromSec: number;
  title: TitleSummary;
  episode: (Episode & { seasonNumber: number }) | null;
  nextEpisodeId: string | null;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
