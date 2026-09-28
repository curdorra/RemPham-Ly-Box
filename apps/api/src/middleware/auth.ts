import type { RequestHandler } from "express";
import { SESSION_COOKIE, verifySession } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import { HttpError } from "../lib/errors.js";
import type { Profile } from "../generated/prisma/client.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      /** Cached by currentProfile(). */
      profile?: Profile;
    }
  }
}

/** Attaches req.userId when a valid session cookie is present. Never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    req.userId = verifySession(token) ?? undefined;
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.userId) {
    next(new HttpError(401, "unauthorized", "Sign in to continue"));
    return;
  }
  next();
};

/** Staff screens: kitchen orders and sales. */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
  if (!req.userId) {
    next(new HttpError(401, "unauthorized", "Sign in to continue"));
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
  if (user?.role !== "ADMIN") {
    next(new HttpError(403, "forbidden", "Staff only"));
    return;
  }
  next();
};
