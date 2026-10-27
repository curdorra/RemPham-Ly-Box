import { z } from "zod";

export const signupSchema = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  name: z.string().trim().min(1).max(80),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const progressSchema = z.object({
  titleId: z.string().min(1),
  episodeId: z.string().min(1).nullish(),
  positionSec: z.number().int().min(0),
  durationSec: z.number().int().min(1),
});
export type ProgressInput = z.infer<typeof progressSchema>;

/** A random id the client keeps per browser/device; used for screen limits. */
const deviceId = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const playbackRequestSchema = z.object({
  titleId: z.string().min(1),
  episodeId: z.string().min(1).nullish(),
  deviceId,
});
export type PlaybackRequest = z.infer<typeof playbackRequestSchema>;

export const heartbeatSchema = z.object({
  ticketId: z.string().min(1),
  deviceId,
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

export const ticketTierSchema = z.enum(["STANDARD", "TOGETHER"]);

/** Seat labels are a row letter and a seat number, e.g. "D7". */
export const seatSchema = z.string().regex(/^[A-Z][1-9][0-9]?$/, "Invalid seat");

const phone = z.string().trim().regex(/^\+?[0-9 ]{10,15}$/, "Enter a valid phone number");

export const deliverySchema = z
  .object({
    address: z.string().trim().min(5).max(300),
    phone,
    when: z.enum(["ASAP", "SCHEDULED"]).default("ASAP"),
    scheduledFor: z.iso.datetime({ offset: true }).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.when === "ASAP" || !!d.scheduledFor, {
    message: "scheduledFor is required for scheduled delivery",
    path: ["scheduledFor"],
  });

/**
 * One checkout for tickets and/or snacks. Tickets: `titleId` (+ `screeningId`
 * for an opening night, optionally with chosen `seats`). Snacks need delivery.
 */
export const createOrderSchema = z
  .object({
    titleId: z.string().min(1).optional(),
    tier: ticketTierSchema.default("STANDARD"),
    quantity: z.number().int().min(1).max(10).default(1),
    screeningId: z.string().min(1).optional(),
    seats: z.array(seatSchema).max(10).optional(),
    snacks: z
      .array(z.object({ itemId: z.string().min(1), qty: z.number().int().min(1).max(20) }))
      .max(20)
      .optional(),
    delivery: deliverySchema.optional(),
  })
  .refine((o) => !!o.titleId || !!o.snacks?.length, { message: "Order a ticket or some snacks" })
  .refine((o) => !o.screeningId || !!o.titleId, { message: "screeningId needs titleId", path: ["screeningId"] })
  .refine((o) => !o.seats || (!!o.screeningId && o.seats.length === o.quantity), {
    message: "Pick one seat per ticket",
    path: ["seats"],
  })
  .refine((o) => !o.seats || new Set(o.seats).size === o.seats.length, { message: "Seats must be different", path: ["seats"] })
  .refine((o) => !o.snacks?.length || !!o.delivery, { message: "Snacks need a delivery address", path: ["delivery"] });
export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const razorpayVerifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
export type RazorpayVerifyInput = z.infer<typeof razorpayVerifySchema>;

export const redeemGiftSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((c) => c.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]{6,20}$/, "Invalid gift code")),
});

export const snackStatusSchema = z.object({
  status: z.enum(["ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"]),
});

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  genre: z.string().trim().max(50).optional(),
  type: z.enum(["MOVIE", "SERIES"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const profileCreateSchema = z.object({
  name: z.string().trim().min(1).max(30),
  kids: z.boolean().default(false),
  avatar: z.string().trim().min(1).max(30).default("oxblood"),
});
const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be 4 digits");
export const profileUpdateSchema = profileCreateSchema.partial().extend({
  /** Set a PIN, or `null` to remove it. */
  pin: pinSchema.nullable().optional(),
  /** Required to change or remove the PIN of a profile that already has one. */
  currentPin: pinSchema.optional(),
});
export const selectProfileSchema = z.object({ profileId: z.string().min(1), pin: pinSchema.optional() });

export const ratingSchema = z.object({ value: z.union([z.literal(-1), z.literal(1), z.literal(2)]) });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const showtimeCreateSchema = z.object({
  cinemaSlug: z.string().min(1),
  filmName: z.string().trim().min(1).max(120),
  titleId: z.string().min(1).optional(),
  posterUrl: z.url().optional(),
  language: z.string().trim().max(40).optional(),
  format: z.string().trim().max(20).default("2D"),
  startsAt: z.iso.datetime({ offset: true }),
});
export const showtimesCreateSchema = z.union([showtimeCreateSchema, z.array(showtimeCreateSchema).min(1).max(100)]);

// ── Staff: catalog, opening nights, kitchens ────────────────────────────────

/** "Ka Nu Leh Ka Pa" → "ka-nu-leh-ka-pa". Mizo diacritics (â, ṭ…) fold to plain letters. */
export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const slug = z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");
/** Artwork: a full URL, or a path on our own site (dev uploads). */
const imageUrl = z.string().trim().min(1).max(500).refine((u) => /^https?:\/\//.test(u) || u.startsWith("/"), "Enter an image URL");
const words = (max: number) => z.array(z.string().trim().min(1).max(80)).max(max);
const seconds = z.number().int().min(0).max(24 * 3600);
export const maturitySchema = z.enum(["G", "PG", "PG13", "R", "NC17", "TVY", "TVPG", "TV14", "TVMA"]);

// Each record has its fields without defaults (for PATCH, where a missing field
// must stay untouched — zod's .partial() would still fill defaults in) and a
// create schema that adds the defaults.

const titleFields = {
  slug,
  type: z.enum(["MOVIE", "SERIES"]),
  name: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().min(1).max(2000),
  year: z.number().int().min(1900).max(2100),
  maturity: maturitySchema,
  posterUrl: imageUrl,
  backdropUrl: imageUrl,
  language: z.string().trim().min(1).max(40),
  /** Genre names; new ones are created. */
  genres: words(8),
  cast: words(60),
  directors: words(10),
  tags: words(30),
  altNames: words(10),
  featured: z.boolean(),
  published: z.boolean(),
  /** Publish automatically at this time (only while unpublished). */
  publishAt: z.iso.datetime({ offset: true }).nullish(),
  durationSec: seconds.nullish(),
  manifestUrl: z.url().max(500).nullish(),
  trailerUrl: z.url().max(500).nullish(),
  pricePaise: z.number().int().min(0).max(1_000_000),
  rentalHours: z.number().int().min(1).max(24 * 30),
  introStartSec: seconds.nullish(),
  introEndSec: seconds.nullish(),
  creditsStartSec: seconds.nullish(),
};
export const titleInputSchema = z.object({
  ...titleFields,
  language: titleFields.language.default("Mizo"),
  genres: titleFields.genres.default([]),
  cast: titleFields.cast.default([]),
  directors: titleFields.directors.default([]),
  tags: titleFields.tags.default([]),
  altNames: titleFields.altNames.default([]),
  featured: titleFields.featured.default(false),
  published: titleFields.published.default(false),
});
export type TitleInput = z.input<typeof titleInputSchema>;
export const titleUpdateSchema = z.object(titleFields).partial();

export const seasonInputSchema = z.object({
  number: z.number().int().min(1).max(99),
  name: z.string().trim().min(1).max(80),
});
export const seasonUpdateSchema = seasonInputSchema.partial();

const episodeFields = {
  number: z.number().int().min(1).max(999),
  name: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().max(1000),
  durationSec: z.number().int().min(1).max(24 * 3600),
  thumbnailUrl: imageUrl,
  manifestUrl: z.url().max(500),
  introStartSec: seconds.nullish(),
  introEndSec: seconds.nullish(),
  creditsStartSec: seconds.nullish(),
};
export const episodeInputSchema = z.object({ ...episodeFields, synopsis: episodeFields.synopsis.default("") });
export type EpisodeInput = z.input<typeof episodeInputSchema>;
export const episodeUpdateSchema = z.object(episodeFields).partial();

const screeningFields = {
  startsAt: z.iso.datetime({ offset: true }),
  /** Null = use the film's price. */
  pricePaise: z.number().int().min(0).max(1_000_000).nullish(),
  rows: z.number().int().min(1).max(26),
  seatsPerRow: z.number().int().min(1).max(99),
  /** Draw an aisle after these seat numbers. */
  aisleAfter: z.array(z.number().int().min(1).max(98)).max(6),
};
export const screeningInputSchema = z.object({
  ...screeningFields,
  titleId: z.string().min(1),
  rows: screeningFields.rows.default(10),
  seatsPerRow: screeningFields.seatsPerRow.default(14),
  aisleAfter: screeningFields.aisleAfter.default([3, 11]),
});
export type ScreeningInput = z.input<typeof screeningInputSchema>;
export const screeningUpdateSchema = z.object(screeningFields).partial();

const kitchenFields = {
  name: z.string().trim().min(1).max(80),
  phone,
  active: z.boolean(),
};
export const kitchenInputSchema = z.object({ ...kitchenFields, active: kitchenFields.active.default(true) });
export const kitchenUpdateSchema = z.object(kitchenFields).partial();

const snackItemFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300),
  pricePaise: z.number().int().min(0).max(1_000_000),
  available: z.boolean(),
  sort: z.number().int().min(0).max(999),
};
export const snackItemInputSchema = z.object({
  ...snackItemFields,
  description: snackItemFields.description.default(""),
  available: snackItemFields.available.default(true),
  sort: snackItemFields.sort.default(0),
});
export const snackItemUpdateSchema = z.object(snackItemFields).partial();

export const uploadKindSchema = z.object({ kind: z.enum(["poster", "backdrop", "still"]) });

/** Subtitle languages staff can add to a film. */
export const SUBTITLE_LANGS = ["en", "lus"] as const;
export const subtitleLangSchema = z.enum(SUBTITLE_LANGS);
export type SubtitleLang = z.infer<typeof subtitleLangSchema>;

/** Stats window: the last N days, or a custom range of calendar days (inclusive, India time). */
export const statsRangeSchema = z
  .object({
    days: z.coerce.number().int().min(1).max(366).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((v) => (v.from === undefined) === (v.to === undefined), { message: "Give both from and to" })
  .refine((v) => !v.from || !v.to || (v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) < 366 * 86400_000), {
    message: "The range must run forwards and be at most a year",
  });
export type StatsRangeInput = z.infer<typeof statsRangeSchema>;
