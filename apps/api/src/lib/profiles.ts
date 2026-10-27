import type { Request, Response } from "express";
import type { Profile as ProfileDto } from "@ott/shared";
import type { Maturity, Prisma, Profile } from "../generated/prisma/client.js";
import { isProd } from "../config.js";
import { prisma } from "./db.js";
import { HttpError } from "./errors.js";

export const PROFILE_COOKIE = "rlb_profile";
export const MAX_PROFILES = 5;

/** What a kids profile may see. */
export const KIDS_MATURITIES: Maturity[] = ["G", "PG", "TVY", "TVPG"];

export function toProfile(p: Profile): ProfileDto {
  return { id: p.id, name: p.name, kids: p.kids, avatar: p.avatar, locked: p.pinHash !== null };
}

export function setProfileCookie(res: Response, profileId: string) {
  res.cookie(PROFILE_COOKIE, profileId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 365 * 24 * 3600 * 1000,
  });
}

/**
 * The profile a signed-in request acts as: the one named by the `x-profile-id`
 * header or `rlb_profile` cookie if it belongs to the user, else their first
 * profile (created on the fly for accounts that have none).
 */
export async function currentProfile(req: Request): Promise<Profile> {
  if (!req.userId) throw new HttpError(401, "unauthorized", "Sign in to continue");
  if (req.profile) return req.profile;
  const header = req.header("x-profile-id");
  const wanted = header ?? req.cookies?.[PROFILE_COOKIE];
  let profile: Profile | null | undefined =
    (typeof wanted === "string" && (await prisma.profile.findFirst({ where: { id: wanted, userId: req.userId } }))) ||
    undefined;
  // The cookie is only set after the PIN was entered; a bare header can't unlock a PIN-protected profile.
  if (profile?.pinHash && header) profile = undefined;
  profile ??= await prisma.profile.findFirst({ where: { userId: req.userId }, orderBy: { createdAt: "asc" } });
  if (!profile) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
    profile = await prisma.profile.create({ data: { userId: user.id, name: user.name } });
  }
  req.profile = profile;
  return profile;
}

/** Catalog visibility for the request: published, and family-friendly on kids profiles. */
export async function visibleTitles(req: Request): Promise<Prisma.TitleWhereInput> {
  const base: Prisma.TitleWhereInput = { published: true };
  if (!req.userId) return base;
  const profile = await currentProfile(req);
  return profile.kids ? { ...base, maturity: { in: KIDS_MATURITIES } } : base;
}
