import type { RequestHandler } from "express";
import { SESSION_COOKIE, verifySession } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";
import { hasActiveSubscription } from "../lib/subscription.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
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

export const requireSubscription: RequestHandler = async (req, _res, next) => {
  if (!req.userId || !(await hasActiveSubscription(req.userId))) {
    next(new HttpError(402, "subscription_required", "An active subscription is required"));
    return;
  }
  next();
};
