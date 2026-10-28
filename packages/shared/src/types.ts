export type TitleType = "MOVIE" | "SERIES";
export type Maturity = "G" | "PG" | "PG13" | "R" | "NC17" | "TVY" | "TVPG" | "TV14" | "TVMA";
export type TicketTier = "STANDARD" | "TOGETHER";
export type OrderStatus = "PENDING" | "PAID" | "EXPIRED" | "REFUNDED";
export type SnackOrderStatus = "AWAITING_PAYMENT" | "PLACED" | "ACCEPTED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELED";

/** What each ticket tier allows. Prices add to the title's base price. */
export const TICKET_TIERS: Record<TicketTier, { screens: number; extraHours: number; addPaise: number }> = {
  STANDARD: { screens: 1, extraHours: 0, addPaise: 0 },
  TOGETHER: { screens: 3, extraHours: 24, addPaise: 6000 },
};

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
  language: string;
  trailerUrl: string | null;
  /** STANDARD ticket price in paise. */
  pricePaise: number;
  /** Hours a ticket lasts after first play. */
  rentalHours: number;
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

export type RatingValue = -1 | 1 | 2;

export interface TitleDetail extends TitleSummary {
  cast: string[];
  directors: string[];
  tags: string[];
  seasons: Season[];
  inMyList: boolean;
  /** The current profile's thumbs, if any. */
  myRating: RatingValue | null;
}

export type RowKind =
  | "continue"
  | "top10"
  | "because"
  | "for_you"
  | "trending"
  | "new"
  | "my_list"
  | "genre"
  | "series";

export interface CatalogRow {
  id: string;
  kind: RowKind;
  label: string;
  titles: TitleSummary[];
  /** Top 10 rows show big rank numbers. */
  ranked?: boolean;
}

export interface HomeFeed {
  hero: TitleSummary | null;
  rows: CatalogRow[];
}

export interface Profile {
  id: string;
  name: string;
  kids: boolean;
  avatar: string;
  /** Switching to this profile needs its PIN. */
  locked: boolean;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: "VIEWER" | "ADMIN";
  /** The profile requests are made as (cookie `rlb_profile`, else the first). */
  profile: Profile;
  profiles: Profile[];
}

export interface SearchResult {
  title: TitleSummary;
  /** Which field matched best, for highlighting. */
  matched: "title" | "people" | "genre" | "tag" | "synopsis";
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  /** Cast and directors matching the query, with their titles. */
  people: { name: string; role: "cast" | "director"; titles: TitleSummary[] }[];
  /** Set when nothing matched but a close title exists. */
  didYouMean: string | null;
}

export interface Suggestion {
  text: string;
  kind: "title" | "person" | "genre";
  /** Titles only. */
  slug?: string;
}

export interface CinemaShowtime {
  id: string;
  filmName: string;
  posterUrl: string | null;
  language: string | null;
  format: string;
  startsAt: string;
  /** Present when the film is (or will be) on RemPham Ly Box too. */
  title: TitleSummary | null;
}

export interface CinemaSchedule {
  cinema: { slug: string; name: string; city: string; address: string };
  days: {
    /** Local date, YYYY-MM-DD. */
    date: string;
    /** BookMyShow buy-tickets page for that day. */
    bookingUrl: string;
    showtimes: CinemaShowtime[];
  }[];
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
  /** "Skip intro" / "Next episode" timings, when known. */
  markers: { introStartSec: number | null; introEndSec: number | null; creditsStartSec: number | null };
  /** The ticket this grant was issued against; send heartbeats for it. */
  ticket: { id: string; tier: TicketTier; screens: number; expiresAt: string | null };
  /**
   * Set during an opening night: everyone watches in sync, so the player must
   * start at `offsetSec` and must not allow seeking.
   */
  live: { screeningId: string; startsAt: string; offsetSec: number } | null;
}

export type TicketState =
  /** Opening night hasn't started yet. */
  | "UPCOMING"
  /** Opening night is playing right now. */
  | "LIVE"
  /** Paid, window not started. */
  | "READY"
  /** Window running. */
  | "ACTIVE"
  | "EXPIRED";

export interface Ticket {
  id: string;
  title: TitleSummary;
  tier: TicketTier;
  screens: number;
  state: TicketState;
  screening: { id: string; startsAt: string } | null;
  seat: string | null;
  firstPlayedAt: string | null;
  expiresAt: string | null;
  orderId: string;
  /** Present on unredeemed extra tickets you bought: share it to gift the ticket. */
  giftCode: string | null;
  /** True for extras you bought that are waiting for someone to redeem. */
  isGiftForOthers: boolean;
}

export interface SnackItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  pricePaise: number;
  kitchen: { id: string; name: string };
}

export interface SnackOrder {
  id: string;
  status: SnackOrderStatus;
  when: "ASAP" | "SCHEDULED";
  scheduledFor: string | null;
  address: string;
  phone: string;
  note: string | null;
  kitchen: { id: string; name: string; phone: string };
  lines: { name: string; unitPaise: number; qty: number }[];
  totalPaise: number;
  createdAt: string;
}

/** How the client completes payment for a pending order. */
export type PaymentCheckout =
  | { provider: "dev" }
  | {
      provider: "razorpay";
      keyId: string;
      razorpayOrderId: string;
      amountPaise: number;
      currency: string;
      name: string;
      description: string;
      prefill: { name: string; email: string };
    };

export interface Order {
  id: string;
  status: OrderStatus;
  amountPaise: number;
  currency: string;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  tickets: Ticket[];
  snackOrder: SnackOrder | null;
  /** Only while PENDING. */
  checkout: PaymentCheckout | null;
}

export interface ScreeningSummary {
  id: string;
  title: TitleSummary;
  startsAt: string;
  pricePaise: number;
  capacity: number;
  seatsTaken: number;
  state: "UPCOMING" | "LIVE" | "ENDED";
  reminded: boolean;
}

export interface ScreeningDetail extends ScreeningSummary {
  layout: { rows: string[]; seatsPerRow: number; aisleAfter: number[] };
  /** Seats sold or held by someone checking out. */
  takenSeats: string[];
  /** Seats on your own paid tickets. */
  mySeats: string[];
}

export interface BoxOfficeEntry {
  rank: number;
  title: TitleSummary;
  tickets: number;
  /** Rank in the previous period, or null if it didn't chart. */
  previousRank: number | null;
  trend: "UP" | "DOWN" | "SAME" | "NEW";
}

export interface BoxOffice {
  from: string;
  to: string;
  entries: BoxOfficeEntry[];
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

// ── Staff ───────────────────────────────────────────────────────────────────

/** A row in the staff film list. */
export interface AdminTitleRow {
  id: string;
  slug: string;
  type: TitleType;
  name: string;
  year: number;
  posterUrl: string;
  pricePaise: number;
  published: boolean;
  publishAt: string | null;
  featured: boolean;
  /** Movie has a manifest, or a series has at least one episode. */
  hasVideo: boolean;
  ticketsSold: number;
  updatedAt: string;
}

export interface AdminEpisode extends Episode {
  manifestUrl: string;
  introStartSec: number | null;
  introEndSec: number | null;
  creditsStartSec: number | null;
}

/** Everything staff can edit on a title. */
export interface AdminTitle {
  id: string;
  slug: string;
  type: TitleType;
  name: string;
  synopsis: string;
  year: number;
  maturity: Maturity;
  posterUrl: string;
  backdropUrl: string;
  language: string;
  genres: string[];
  cast: string[];
  directors: string[];
  tags: string[];
  altNames: string[];
  featured: boolean;
  published: boolean;
  publishAt: string | null;
  durationSec: number | null;
  manifestUrl: string | null;
  trailerUrl: string | null;
  pricePaise: number;
  rentalHours: number;
  introStartSec: number | null;
  introEndSec: number | null;
  creditsStartSec: number | null;
  seasons: { id: string; number: number; name: string; episodes: AdminEpisode[] }[];
  ticketsSold: number;
  /** Films only: the latest upload from the staff screens, if any. */
  video: AdminVideo | null;
}

export interface AdminScreening {
  id: string;
  title: { id: string; name: string; posterUrl: string; pricePaise: number; published: boolean };
  startsAt: string;
  /** Override, or null when it uses the film's price. */
  pricePaise: number | null;
  rows: number;
  seatsPerRow: number;
  aisleAfter: number[];
  capacity: number;
  seatsSold: number;
  /** Any tickets at all (paid or held): the seat map can no longer change. */
  hasTickets: boolean;
  state: "UPCOMING" | "LIVE" | "ENDED";
}

export interface AdminSnackItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  pricePaise: number;
  available: boolean;
  sort: number;
}

export interface AdminKitchen {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  items: AdminSnackItem[];
}

/** Subtitle renditions of a packaged film (`films/<slug>/` on R2). */
export interface AdminSubtitles {
  /** False until the film has been packaged by publish-film. */
  hasVideo: boolean;
  languages: { lang: string; name: string }[];
}

// ── Staff statistics ────────────────────────────────────────────────────────

export interface StatsTitleMoney {
  titleId: string;
  name: string;
  tickets: number;
  grossPaise: number;
}

export interface StatsTitleWatching {
  titleId: string;
  name: string;
  /** Distinct profiles with watch progress updated in the range. */
  viewers: number;
  avgWatchSec: number;
  /** 0–1. */
  completionRate: number;
  /** Share of viewers (0–1) who reached 10%, 20% … 100% of the runtime. */
  dropOff: number[];
}

export interface AdminStats {
  range: { from: string; to: string };
  money: {
    grossPaise: number;
    tickets: number;
    byTitle: StatsTitleMoney[];
    /** One entry per calendar day in India time, zero-filled. */
    byDay: { day: string; tickets: number; grossPaise: number }[];
    byTier: { tier: TicketTier; tickets: number; grossPaise: number }[];
    snackPaise: number;
    snackOrders: number;
    /** Gift codes sold in the range, and how many of those have been redeemed since. */
    giftsIssued: number;
    giftsRedeemed: number;
  };
  audience: { signUps: number; buyers: number; repeatBuyers: number };
  watching: {
    /** Playback sessions seen in the last 90 seconds. */
    viewersNow: number;
    avgWatchSec: number;
    completionRate: number;
    byTitle: StatsTitleWatching[];
  };
  openingNights: {
    id: string;
    titleId: string;
    name: string;
    startsAt: string;
    sold: number;
    capacity: number;
    /** Sessions seen in the last 90 seconds on this screening's tickets. */
    joinedNow: number;
  }[];
  /** Thumbs: -1 dislike, 1 like, 2 love. `approval` = (liked + loved) / count. */
  ratings: { titleId: string; name: string; disliked: number; liked: number; loved: number; count: number; approval: number }[];
}

export type VideoStatus = "UPLOADING" | "QUEUED" | "CONVERTING" | "READY" | "FAILED";

/** A film's video upload and its conversion to HLS. */
export interface AdminVideo {
  status: VideoStatus;
  fileName: string;
  sizeBytes: number;
  /** Conversion progress, 0–100. */
  progress: number;
  error: string | null;
  updatedAt: string;
}

/** Where the browser sends each part of a video upload (straight to storage). */
export interface VideoUploadTarget {
  partSize: number;
  parts: { partNumber: number; url: string }[];
}
