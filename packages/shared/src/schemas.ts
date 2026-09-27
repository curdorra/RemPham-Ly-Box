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

export const playbackRequestSchema = z.object({
  titleId: z.string().min(1),
  episodeId: z.string().min(1).nullish(),
});
export type PlaybackRequest = z.infer<typeof playbackRequestSchema>;

export const checkoutSchema = z.object({
  planId: z.string().min(1),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  genre: z.string().trim().max(50).optional(),
  type: z.enum(["MOVIE", "SERIES"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
