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
export const profileUpdateSchema = profileCreateSchema.partial();
export const selectProfileSchema = z.object({ profileId: z.string().min(1) });

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
