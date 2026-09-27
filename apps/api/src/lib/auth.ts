import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
import { config, isProd } from "../config.js";

export const SESSION_COOKIE = "ott_session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

interface SessionClaims {
  sub: string;
}

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId } satisfies SessionClaims, config.JWT_SECRET, {
    expiresIn: SESSION_TTL_SEC,
  });
}

export function verifySession(token: string): string | null {
  try {
    const claims = jwt.verify(token, config.JWT_SECRET) as SessionClaims;
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProd,
  path: "/",
};

export function setSessionCookie(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, signSession(userId), { ...cookieOptions, maxAge: SESSION_TTL_SEC * 1000 });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}
